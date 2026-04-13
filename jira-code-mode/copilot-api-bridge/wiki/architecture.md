# Architecture

## High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                     VS Code Copilot Chat                         │
└────────────────────────┬────────────────────────────────────────┘
                         │ (MCP Protocol via stdio)
┌────────────────────────▼────────────────────────────────────────┐
│              copilot-api-bridge MCP Server                       │
├────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Service Registry│  │  Sandbox Runner  │  │  Tool Factory │  │
│  │                 │  │                  │  │               │  │
│  │ • Adapters      │  │ • V8 Isolation   │  │ • Tool Gen    │  │
│  │ • Discovery     │  │ • Timeouts       │  │ • Auto-Wiring │  │
│  │ • Caching       │  │ • Memory Limits  │  │               │  │
│  └─────────────────┘  │ • Auth Injection │  └───────────────┘  │
│                       └──────────────────┘                       │
├────────────────────────────────────────────────────────────────┤
│  Service Adapters Layer                                         │
├────────┬──────────────┬──────────────────────────────────────┤
│ Jira   │ Tasks        │ Azure SQL                            │
├────────┼──────────────┼──────────────────────────────────────┤
│ Facade │ Facade       │ Facade                               │
│ Docs   │ Docs         │ Docs                                 │
│ Tools  │ Tools        │ Tools                                │
└────────┴──────────────┴──────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────────┐      ┌──────────┐      ┌───────────────┐
    │ Jira REST   │      │ Task DB  │      │ Azure SQL DB  │
    │ API         │      │ (Memory) │      │ (mssql)       │
    └─────────────┘      └──────────┘      └───────────────┘
```

## Core Components

### 1. Service Registry (`core/registry/`)

**Purpose**: Central catalog for all microservice adapters.

**Responsibilities**:
- Register service adapters at startup
- Discover services by name
- Provide list of all active services
- Prevent duplicate service names

**Key Files**:
- `service-registry.ts` — Registry implementation (singleton)
- `types.ts` — `ServiceAdapter` interface definition

### 2. Sandbox Runner (`core/sandbox/`)

**Purpose**: Execute user-generated JavaScript safely in an isolated V8 environment.

**Responsibilities**:
- Create isolated V8 context for each script execution
- Inject facade methods into the sandbox
- Enforce timeout limits (30 seconds)
- Enforce memory limits (128 MB)
- Log execution and potential policy violations
- Return results securely

**Key Files**:
- `runner.ts` — Main sandbox orchestration
- `policy.ts` — Policy engine for detecting dangerous operations

**Security Model**:
- Credentials are NEVER passed to the sandbox
- Facade methods are injected pre-authenticated
- Scripts run within CPU/memory/time constraints
- All I/O is through the facade only

### 3. Tool Factory (`core/mcp/tools.ts`)

**Purpose**: Auto-generate MCP tools from service adapters and register them with the MCP server.

**Tool Types Generated**:

**a) Direct Tools** (bypass sandbox)
- High-frequency, single-method operations
- Defined explicitly in each adapter's `index.ts`
- Examples: `jira_get_issue`, `tasks_list`, `sql_schema`
- Use for fast lookups

**b) Automatic Tools** (two per service)
- `{service}_search_docs` — Semantic search of capability documentation with Fuse.js
- `{service}_execute` — Execute user-generated code against the facade

## Request Flow

```
1. User asks Copilot: "Get all open issues in MYAPP"

2. Copilot searches docs → jira_search_docs
   → Returns relevant methods from capabilities.ts

3. Copilot generates code using facade methods:
   const results = await jira.search({ jql: "project = MYAPP AND status = Open" });
   return results.issues.map(i => ({ key: i.key, summary: i.summary }));

4. Copilot calls tools → jira_execute
   → Bridge injects CODE, jira facade, docs into sandbox

5. Sandbox executes code (30s timeout, 128MB limit)
   → Results returned to Copilot

6. Copilot displays results in chat
```

## Service Adapter Pattern

Each service follows a three-part structure:

### Part 1: Facade (`services/{name}/facade/{name}.ts`)

```typescript
export class {Name}Facade {
  // Pre-authenticated methods that Copilot can call
  async search() { ... }
  async getDetails() { ... }
  async mutate() { ... }
}
```

**Key Principle**: All authentication is handled at the facade layer. The sandbox never sees credentials.

### Part 2: Documentation (`services/{name}/docs/capabilities.ts`)

Human-readable documentation of all available facade methods, parameters, and return types.

Used by `{service}_search_docs` to help Copilot find relevant methods.

### Part 3: Adapter Export (`services/{name}/index.ts`)

```typescript
export const {Name}Adapter: ServiceAdapter = {
  name: "short_name",
  description: "Human-readable",
  facade: { methods },
  docs: { capabilities },
  directTools: [ tools ],
};
```

Then register in `mcp-server.ts`:
```typescript
import { {Name}Adapter } from './services/{name}/index.js';
ServiceRegistry.register({Name}Adapter);
```

## MCP Server Integration

The MCP server (`mcp-server.ts`):
1. Imports all service adapters
2. Registers each with `ServiceRegistry`
3. Iterates over registered adapters
4. For each adapter, calls `registerAdapterTools()`
5. `registerAdapterTools()` generates and wires all MCP tools
6. Starts stdio transport for VS Code connection

## Security Principles

1. **Credential Injection** — Secrets are bound to facade methods at startup, never exposed
2. **Sandbox Isolation** — All user code runs in V8 Isolate with resource limits
3. **Explicit Tool Surface** — Direct tools are whitelisted; no ambient access
4. **Policy Engine** — Detects potentially dangerous operations (e.g., mutation attempts)
5. **No Side Channels** — Sandbox cannot access filesystem, process, or network except through facade

## Scalability Considerations

- Service registry uses simple Map lookup (O(1))
- Direct tools bypass sandbox for O(1) latency
- Each adapter pools connections to its backend (e.g., SQL connection pooling)
- Sandbox is reused across multiple executions
- Timeout and memory limits prevent runaway operations
