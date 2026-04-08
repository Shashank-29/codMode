# Copilot API Bridge — End-to-End Implementation Plan
## For Any Coding Agent Starting From Scratch

---

## 1. What Is Being Built

A reusable internal platform called **copilot-api-bridge** that turns any backend service's OpenAPI spec into a Copilot-accessible, agent-ready interface inside VS Code — through a standardized pipeline.

This is **not**:
- A Jira-specific tool
- A one-off automation script
- A vendor product or external SDK

This **is**:
- An internal platform pattern the org owns
- A repeatable pipeline: OpenAPI spec → typed client → clean facade → MCP tools → VS Code Copilot
- A framework where adding a new service takes hours, not weeks
- The infrastructure layer that autonomous agents will use in the future

**Jira is adapter #1.** The framework validates itself when adapter #2 (any simpler internal service) takes a fraction of the time adapter #1 did.

---

## 2. The Problem Being Solved

### Immediate Pain
Developers and scrum masters context-switch to Jira's web UI for routine tasks: creating issues, updating statuses, searching tickets, adding comments, checking sprint health. This fragments their focus inside VS Code.

### Deeper Problem
Copilot is powerful but org-blind. It knows every public API on the internet but nothing about your org's internal services. Every time a developer needs to build against, test, or operate an internal backend — they leave VS Code, hunt for docs, figure out auth, manually call endpoints, and copy-paste responses. This compounds across every service, every developer, every day.

### Why Existing Solutions Don't Solve It

| Approach | Why It Fails |
|---|---|
| Naive OpenAPI→MCP generators (1 endpoint = 1 tool) | Tool overload: LLMs struggle with large tool sets. 100 endpoints = 100 tools = hallucinations and mis-selection |
| Atlassian's official Cloud MCP | Generic connector, not org-specific. Doesn't encode business logic, naming, or workflow conventions |
| Manual Jira-only SDK | Becomes dead weight post-migration to Jira Cloud. Doesn't scale to other services |
| Raw HTTP in agent prompts | Leaks auth, unreliable, no type safety, forces LLM to reconstruct API knowledge every time |

---

## 3. The Core Insight — Small Tool Set Over Tool Flood

Cloudflare published research showing that instead of registering N tools (one per endpoint), you register a **small curated set of meaningful tools** per service (typically **4–5**, never more than ~8):

For example, a service might expose:
1. `{service}_search_docs` — compressed capability discovery
2. `{service}_execute` — runs TypeScript code the model writes against a typed facade
3. `{service}_get_status` — quick read for a single entity by key
4. `{service}_action` — perform a named mutation with confirmation

The key principle is that each tool maps to a **distinct interaction mode**, not a 1:1 mirror of API endpoints. The code-execution tool handles complex multi-step logic, while dedicated tools can handle common high-frequency patterns directly — giving the model clear choices without overwhelming it.

This approach — a small, meaningful tool set with code mode at its center — is what this framework standardizes for internal use.

---

## 4. The Pipeline (For Any Service)

```
Internal Service (any backend)
        ↓
OpenAPI / Swagger spec  ←  already exists or easy to add
        ↓  [automated — swagger-typescript-api]
Auto-generated Base Client  (raw typed endpoint methods, never edited)
        ↓  [~2 hours handwritten per service]
Typed Facade  (clean method names, auth injection, pagination, helpers, JSDoc)
        ↓  [minimal config — framework handles most of this]
4–5 MCP Tools: search_docs + execute + curated direct tools
        ↓  [V8 isolate for code execution — API tokens never exposed to model]
Sandboxed Code Execution (for execute tool)
        ↓
VS Code Copilot Chat
```

Three of these five steps are automated or done once. The only thing a service team ever writes is the facade — a clean TypeScript wrapper around the generated client. That is the intentional design.

---

## 5. Architecture

### 5.1 Layers

**Layer 1 — Generated Base Client (auto)**
Produced by `swagger-typescript-api` from the OpenAPI spec. Contains raw typed methods for every endpoint. This file is never manually edited and gets overwritten when the spec changes. It exists purely to provide types and make HTTP calls.

**Layer 2 — Typed Facade (handwritten, ~2 hrs per service)**
The only layer written by humans. This is where org knowledge lives:
- Clean human-readable method names (`moveIssueToStatus` not `postRestApiV2IssueTransitions`)
- Auth injection (credentials injected here, model never sees them)
- Business logic helpers (e.g., resolving transition names to IDs)
- Pagination handled transparently
- Custom field mappings for the org's Jira setup
- Error messages that explain what went wrong in human terms

**Layer 3 — Capability Docs (handwritten, ~20 mins)**
A plain text or markdown document listing all facade methods, their parameters, and usage examples. This is what `search_docs` returns to the model. It must be concise because the model needs to find the right method quickly.

**Layer 4 — MCP Tools (framework-generated + optional custom)**
The core framework automatically creates the base tools (`search_docs` + `execute`) per registered service. Adapters can optionally declare additional direct tools (up to ~3 more) for high-frequency operations that benefit from a dedicated interface. Total tools per service should stay in the 4–5 range.

**Layer 5 — V8 Sandbox (framework)**
Code the model generates runs inside an isolated V8 context (via `isolated-vm`). The facade object is injected as a binding. The model can't access the filesystem, network, or environment variables. API credentials are never visible to the model or to generated code.

**Layer 6 — VS Code MCP Server**
Single stdio-based MCP server that VS Code connects to. All services are registered here. Adding a new service is one line.

### 5.2 Service Adapter Contract

Every service must export one object conforming to this interface:

```
ServiceAdapter {
  name: string           // "jira", "payments", "users"
  description: string    // shown to Copilot when listing tools
  facade: object         // all callable typed methods
  docs: () => string     // capability text for search_docs
  directTools?: Tool[]   // optional extra tools for high-frequency ops
}
```

That's the complete contract. The framework always creates `search_docs` and `execute`. The adapter can optionally add 2–3 direct tools for frequent operations (e.g., a quick lookup or a common mutation). Everything else is handled by the framework.

### 5.3 Folder Structure

```
copilot-api-bridge/
├── core/
│   ├── sandbox/          ← V8 isolate executor (shared, written once)
│   ├── registry/         ← Service registry and ServiceAdapter type
│   └── mcp/              ← Tool factory (base + direct), MCP server bootstrap
│
├── services/
│   ├── jira/             ← Adapter #1
│   │   ├── spec/         ← jira-openapi.json (source of truth)
│   │   ├── generated/    ← Auto-generated, never edit
│   │   ├── facade/       ← Handwritten clean methods
│   │   ├── docs/         ← Capability text for search_docs
│   │   └── index.ts      ← Exports JiraAdapter (the ServiceAdapter)
│   │
│   └── [service-n]/      ← Every new service mirrors this structure
│
├── scripts/
│   └── generate.ts       ← Runs swagger-typescript-api for any service
│
├── mcp-server.ts         ← Entry point: register adapters, start server
├── .vscode/mcp.json      ← VS Code MCP registration
└── .env.example          ← Per-service credentials template
```

---

## 6. Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| MCP SDK | @modelcontextprotocol/sdk | Native VS Code Copilot support |
| Client generation | swagger-typescript-api | Generates callable client, not just types. Supports OpenAPI 2/3 |
| Sandbox | isolated-vm (V8 isolates) | Fast (~50ms), secure, same approach Anthropic uses |
| Schema validation | zod | Native MCP SDK integration |
| Runtime | tsx + Node.js 20+ | Fast TS execution, no compile step needed |
| Auth pattern | Env var injection at facade init | Tokens never reach sandbox or model |
| CI automation | GitHub Actions (spec → regen) | Client stays in sync with API automatically |

---

## 7. Jira Adapter — Specific Decisions

### Why Jira First
The org's current Jira Server is the most painful daily context-switch for developers and scrum masters. It is also a migration risk (moving to Jira Cloud) which forces good adapter design from day one — the facade must be portable.

### Migration Strategy
The facade API stays identical between Jira Server and Jira Cloud. Only the generated base client changes (different spec). The model and Copilot see no difference. Swapping Server → Cloud is a backend adapter change, not a platform change.

### Jira-Specific Facade Methods (v1 — 8 methods)
These cover 80% of real developer/scrum master workflows:

| Method | Who Uses It | What It Hides |
|---|---|---|
| `getIssue(issueKey)` | Developer | Field selection, response normalization |
| `searchIssues(jql, max?)` | Both | Pagination, response unwrapping |
| `moveIssueToStatus(issueKey, statusName)` | Developer | Transition ID resolution, available transitions lookup |
| `addComment(issueKey, text)` | Developer | Body format, response shape |
| `getMyBlockers(assignee?)` | Developer | JQL construction, defaults |
| `getSprintSummary(boardId)` | Scrum Master | 4 parallel JQL queries, aggregation |
| `createIssue(project, type, summary, desc?)` | Developer | Field structure, issuetype format |
| `assignIssue(issueKey, accountId)` | Scrum Master | Request body format |

### What the Jira Facade Must Hide
- Auth headers (Basic auth with base64 encoded credentials)
- Base URL construction
- Transition IDs (resolve from human-readable status names)
- Custom field IDs (e.g., `customfield_10032` for story points)
- Pagination for search results
- Response unwrapping (`.data.issues` etc.)
- HTTP error → human-readable error message translation

---

## 8. MCP Tools — Design (4–5 Per Service)

Each service gets a **small, curated set of tools** — typically 4–5, never more than ~8. Every tool must map to a distinct interaction mode, not a 1:1 endpoint mirror.

### Base Tools (auto-created by framework)

#### Tool 1: `{service}_search_docs`
**Purpose:** Let the model discover what the service can do before writing code.
**Input:** A natural language query string.
**Output:** Filtered capability text — method names, parameters, examples.
**Why it matters:** Without this, the model would have to guess method names or hallucinate them. This tool replaces the entire API reference in ~500 tokens.

#### Tool 2: `{service}_execute`
**Purpose:** Run TypeScript code against the typed facade for complex/multi-step logic.
**Input:** A TypeScript code string using the facade object.
**Output:** The return value of the code, or a structured error.
**Safety rules:**
- Runs in V8 isolate with 128MB memory limit and 10s timeout
- Facade object injected as binding — no network, no filesystem, no env vars accessible
- Mutating methods (create, update, transition, comment) trigger a confirmation preview before executing
- All executions are logged with service name, duration, success status

### Direct Tools (adapter-defined, optional)

For high-frequency or simple operations, adapters can register dedicated tools that skip the code-generation step. These give the model a faster, more direct path for common tasks.

#### Example — Jira Adapter Direct Tools:

| Tool | Purpose | Why Not Just `execute`? |
|---|---|---|
| `jira_get_issue` | Quick lookup by issue key | Most common operation, no code needed |
| `jira_search` | Run a JQL query | Simpler UX than writing facade code for basic searches |
| `jira_mutate` | Named mutation with confirmation (move, assign, comment, create) | Enforces confirmation gate at tool level, clearer intent |

Direct tools should only be added when they meaningfully reduce latency or improve clarity for the model. If an operation is rare or involves multi-step logic, it belongs in `execute`.

### Example Workflow
```
User: "Move ABC-123 to In Progress and add a comment: PR is ready"

1. Model calls jira_search_docs("move issue to status, add comment")
   → Returns: moveIssueToStatus, addComment signatures + examples

2. Model calls jira_execute with:
   const r1 = await jira.moveIssueToStatus("ABC-123", "In Progress");
   const r2 = await jira.addComment("ABC-123", "PR is ready");
   return { r1, r2 };

3. Sandbox runs, returns result
4. Copilot shows: "Done — ABC-123 moved to In Progress, comment added"
```

Or for a simple lookup:
```
User: "Show me ABC-123"

1. Model calls jira_get_issue("ABC-123")
   → Returns issue details directly — no code generation needed
```

Complex workflows use `execute` (2 tool calls). Simple operations use direct tools (1 call).

---

## 9. Build Phases

### Phase 0 — Core Framework (Day 1, ~4 hours)
Build once, never rebuild:
- `core/registry/types.ts` — ServiceAdapter interface
- `core/registry/service-registry.ts` — register/get/list services
- `core/sandbox/runner.ts` — V8 isolate executor with timeout, memory limit, binding injection
- `core/sandbox/policy.ts` — write operation detection for confirmation gate
- `core/mcp/tools.ts` — generic factory that creates base tools + merges adapter direct tools
- `mcp-server.ts` — entry point, imports adapters, starts stdio server

### Phase 1 — Jira Adapter (Days 2–4, ~8 hours)
- Fetch Jira OpenAPI spec from org instance
- Enrich spec operationIds and descriptions before generating (this directly affects JSDoc quality)
- Run `swagger-typescript-api` to generate base client
- Write `services/jira/facade/jira.ts` — 8 methods
- Write `services/jira/docs/capabilities.ts` — method docs + examples
- Export `JiraAdapter` from `services/jira/index.ts`
- Register in `mcp-server.ts`

### Phase 2 — VS Code Integration (Day 4, ~1 hour)
- Write `.vscode/mcp.json` pointing to `tsx mcp-server.ts`
- Set env vars for Jira credentials
- Test in MCP Inspector before VS Code
- Validate 4 workflows end-to-end in Copilot Chat

### Phase 3 — Service #2 Validation (Day 5, ~2 hour target)
Pick simplest internal service with an OpenAPI spec (user management, feature flags, notifications). The entire onboarding is: fetch spec → run generator → write facade → write docs → export adapter → one-line registration. If this takes under 2 hours, the framework is working.

### Phase 4 — Hardening (Week 2, ~10 hours)
- CI pipeline: GitHub Actions watches `services/*/spec/*.json`, auto-runs regeneration, commits updated clients
- Approval gate: mutating operations show preview and require confirmation before sandbox execution
- Observability: structured logs per execution (service, method calls, duration, success)
- Error handling: sandbox errors return structured responses with actionable messages
- `.env.example` documentation for each service's required credentials

### Phase 5 — Future Roadmap
- **Month 2:** Replace keyword-based `search_docs` with embedding-based semantic search (find the right method even if the user's phrasing doesn't match)
- **Month 2:** Multi-service orchestration (one prompt operates Jira + Slack + user service in sequence)
- **Month 3:** Autonomous agent mode (assign a task, agent plans and executes across multiple facades)
- **Month 3:** Internal service registry UI (list all registered services, their capabilities, usage metrics)

---

## 10. Validation Criteria

### Framework Is Working When:
- Service #1 (Jira): End-to-end from spec to working Copilot tools in under 3 days
- Service #2 (any): End-to-end in under 2 hours
- Token usage per complex workflow stays under 2,000 tokens
- Multi-step workflows (move + comment + assign) complete in 2–3 tool calls
- API credentials are never visible in Copilot Chat or sandbox logs

### Copilot Workflows That Must Work (Jira):
1. "Move [issue] to [status]"
2. "Add a comment to [issue] saying [text]"
3. "Show me my blocked issues"
4. "Create a bug for [description] in project [key]"
5. "Summarize sprint health for board [id]"
6. "Get details of [issue]"

---

## 11. Key Principles to Not Violate

1. **Never expose raw generated client methods to the model.** The generated client is an implementation detail behind the facade.

2. **Keep tools per service in the 4–5 range (never more than ~8).** Tool flood kills LLM accuracy. Each tool must represent a distinct interaction mode, not a 1:1 endpoint mapping. High-frequency simple ops get direct tools; complex/multi-step ops go through `execute`.

3. **Never let API credentials reach the sandbox or the model.** Inject them at facade initialization only.

4. **Never hardcode service-specific logic in the framework core.** Core knows only ServiceAdapter. Service-specific knowledge lives in the facade.

5. **Treat generated files as sacred.** Nothing in `services/*/generated/` is ever manually edited. All changes go through spec → regenerate.

6. **The facade is the org's API.** It encodes your org's naming, conventions, defaults, and business logic. It is the most important file per service.

---

## 12. Context for the Coding Agent

When implementing this, the agent should understand the following priorities in order:

1. **Get the core framework right first** (Phase 0). A bad ServiceAdapter interface will force rewrites of every adapter.
2. **Test the sandbox in isolation** before wiring to MCP. The V8 isolate setup is the most complex piece.
3. **Write the Jira facade as if it's a public SDK.** Good method names, good JSDoc, clear error messages. The model is the consumer.
4. **Keep the capability docs (search_docs content) concise.** Under 1,000 tokens total. Every word in there competes for model attention.
5. **Do not build more than 8 Jira facade methods in v1.** Scope creep here delays the framework validation.
6. **Service #2 is the real test.** Pick it before starting Phase 1 so the facade design stays appropriately generic.
