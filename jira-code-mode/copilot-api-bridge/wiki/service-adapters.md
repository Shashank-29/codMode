# Service Adapters

A service adapter is the bridge between a backend microservice (REST API, database, or other) and Copilot. It consists of three interconnected parts: the Facade, the Documentation, and the Adapter Export.

## The Three-Part Pattern

### Part 1: Facade

The **Facade** is a curated class that wraps the raw backend API/database with a simplified, typed interface suitable for code generation.

**Characteristics**:
- All methods are async
- Clear, intention-revealing parameter names
- Comprehensive return types (TypeScript)
- Pre-authenticated (credentials injected at startup)
- Handles connection pooling and lifecycle
- Returns JSON-serializable results

**Example**:
```typescript
export class JiraFacade {
  async getIssue(issueKey: string): Promise<IssueDetail> { ... }
  async search(jql: string, maxResults?: number): Promise<SearchResult> { ... }
  async discover(): Promise<DiscoveryData> { ... }
}
```

**Key Principle**: The facade is the **only** way user-generated code can interact with the backend. It is the security boundary.

### Part 2: Documentation

The **Documentation** (capabilities) is a structured, human-readable guide to every method on the facade.

**Purpose**:
- Fed to Copilot so it understands what's available
- Used by `{service}_search_docs` tool for semantic search
- Helps Copilot write correct code

**Format**:
```typescript
export const jiraDocs = {
  name: "Jira Service",
  description: "...",
  methods: [
    {
      name: "getIssue",
      description: "Get full details of a Jira issue by key",
      parameters: [
        {
          name: "issueKey",
          type: "string",
          description: "Issue key, e.g. PROJ-123"
        }
      ],
      returns: "Detailed issue object with all fields"
    },
    // ... more methods
  ]
};
```

### Part 3: Adapter Export

The **Adapter Export** wires the facade and docs into the framework, registers direct tools, and exports a `ServiceAdapter` object.

**Structure**:
```typescript
// 1. Instantiate facade
const facade = new JiraFacade();

// 2. Define direct tools (high-frequency operations)
const getIssueTool: DirectTool = {
  name: 'get_issue',
  description: '...',
  parameters: { issueKey: z.string() },
  handler: async (params) => facade.getIssue(params.issueKey)
};

// 3. Export adapter
export const JiraAdapter: ServiceAdapter = {
  name: 'jira',
  description: 'Jira issue tracking integration',
  facade: { getIssue: facade.getIssue.bind(facade), ... },
  docs: jiraDocs,
  directTools: [getIssueTool, searchTool, discoverTool]
};
```

## Direct Tools vs. Code Execution

### Direct Tools
- **When to use**: High-frequency, simple operations
- **Examples**: Get single record, quick lookup, search
- **Execution**: Immediate, bypasses sandbox
- **Response time**: Sub-100ms typically

```typescript
const getIssueTool: DirectTool = {
  name: 'get_issue',
  handler: async (params) => facade.getIssue(params.issueKey)
};
```

**Usage in chat**:
```
User: "What is the title of PROJ-123?"
Copilot → jira_get_issue(issueKey="PROJ-123")
Response: Instant
```

### Code Execution
- **When to use**: Complex logic, data transformation, chaining multiple operations
- **Examples**: Filter results, aggregate data, orchestrate workflows
- **Execution**: User code in sandbox, has access to facade
- **Response time**: Seconds (includes sandboxing overhead)

**Usage in chat**:
```
User: "List all open issues in MYAPP assigned to me, sorted by priority"
Copilot → jira_search_docs() (find relevant methods)
Copilot → jira_execute(code: "...")
// Code runs in sandbox
```

## Current Services

See [Services](services/) directory for detailed documentation on:
- [Jira](services/jira.md) — 3 direct tools, full async/await facade
- [Tasks](services/tasks.md) — 3 direct tools, in-memory task database
- [Azure SQL](services/azure-sql.md) — 2 direct tools, direct SQL queries

## Adding a New Service

See [Onboarding Guide](onboarding.md) for step-by-step instructions to integrate a new backend service.

## Best Practices

### Facade Design
✅ **Do**:
- Use descriptive method names that reveal intent
- Return complete data structures (let Copilot filter)
- Include error messages and edge case handling
- Document parameter constraints (e.g., "e.g. PROJ-123")

❌ **Don't**:
- Expose credentials in method signatures
- Return raw HTTP responses
- Use ambiguous parameter names (e.g., `p1`, `p2`)
- Ignore failure modes

### Documentation
✅ **Do**:
- Provide concrete examples for each method
- Explain constraints and required formats
- List common error scenarios
- Note any rate limits or quotas

❌ **Don't**:
- Assume Copilot knows your API
- Omit edge cases
- Use technical jargon without explanation

### Direct Tools
✅ **Do**:
- Define for truly hot-path operations
- Use Zod schemas for strict parameter validation
- Provide meaningful error messages
- Keep handlers simple (thin wrapper around facade)

❌ **Don't**:
- Bypass the facade entirely
- Define tools for rare operations
- Handle errors silently

## Security Considerations

1. **Credential Handling**: All credentials attached to facade at instantiation, never exposed to sandbox or LLM
2. **Input Validation**: Use Zod schemas on all direct tool parameters
3. **Output Sanitization**: Return only necessary fields; avoid leaking internal IDs or debug info
4. **Resource Limits**: Be aware of sandbox memory (128MB) and timeout (30s) when designing return data sizes
5. **Audit Logging**: Log all mutations (create, update, delete) for compliance
