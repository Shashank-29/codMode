# Tool Factory

Automatically generates MCP tools from service adapters and registers them with the MCP server.

## Purpose

The Tool Factory:
- Inspects registered service adapters
- Auto-generates standard tools for each service
- Registers direct tools from adapter definitions
- Wires adapter facades into the MCP tool handlers
- Provides semantic search and code execution capabilities

## Location

- **File**: [core/mcp/tools.ts](../../core/mcp/tools.ts)

## How It Works

### Initialization Flow

```
1. MCP server created
2. Iterate over ServiceRegistry.list()
3. For each adapter, call registerAdapterTools(server, adapter, sandbox)
4. Register direct tools (if defined)
5. Register auto-generated tools:
   - {service}_search_docs
   - {service}_execute
6. All tools wired to sandbox and facades
```

## Tool Types

### Type 1: Direct Tools

**Definition**: High-frequency, single-operation tools that bypass the sandbox.

**Generation**: Defined explicitly in the adapter's `index.ts` file, passed via `directTools` array.

**Wiring**:
```typescript
// For each direct tool in adapter.directTools:
server.tool(
  `${adapter.name}_${directTool.name}`,
  { description, parameters },
  handler // Executes immediately
);
```

**Example**: `jira_get_issue`
```typescript
Handler:
  1. Parse parameters (issueKey)
  2. Call facade.getIssue(issueKey)
  3. Return result instantly
```

**Characteristics**:
- Response time: <100ms typically
- No sandbox overhead
- Used for lookups, fetches, simple queries
- Result directly displayed in Copilot chat

### Type 2: Auto-Generated Tools

#### Tool: `{service}_search_docs`

**Purpose**: Semantic search over service documentation to find relevant methods.

**Implementation**:
- Uses Fuse.js for fuzzy matching
- Indexes all methods from `adapter.docs`
- Returns matching methods with descriptions
- Helps Copilot discover what's available

**Example Call**:
```
User: "How do I get an issue?"
Copilot calls: jira_search_docs(query="get issue")
Response: [
  { name: "getIssue", description: "Get full details of a Jira issue by key" },
  { name: "search", description: "Search Jira issues using JQL" }
]
```

**Handler Logic**:
```typescript
function handler(params) {
  const index = buildFuseIndex(adapter.docs.methods);
  const results = index.search(params.query);
  return results.map(r => r.item);
}
```

#### Tool: `{service}_execute`

**Purpose**: Execute user-generated code with access to the facade.

**Implementation**:
- Receives user code as string parameter
- Passes to SandboxRunner
- Injects adapter's facade into sandbox
- Returns sandbox execution result

**Example Call**:
```
User: "Find all open issues assigned to me"
Copilot generates code and calls:
  jira_execute(code: "...")
  // Code contains: await jira.search({ jql: "assignee = currentUser() AND status = Open" })
Response: Array of matching issues
```

**Handler Logic**:
```typescript
async function handler(params) {
  const result = await sandbox.execute(
    params.code,
    { [adapter.name]: adapter.facade }  // Inject facade
  );
  return result;
}
```

## Tool Naming Convention

All tools are prefixed with the service name:

```
{service_name}_{tool_name}
```

### Examples

| Adapter | Tool | Full Name |
|---------|------|-----------|
| jira | get_issue | jira_get_issue |
| jira | search | jira_search |
| jira | (auto) | jira_search_docs |
| jira | (auto) | jira_execute |
| tasks | list | tasks_list |
| sql | (auto) | sql_execute |

## Registration Process

### In mcp-server.ts

```typescript
import { registerAdapterTools } from './core/mcp/tools.js';

const sandbox = new SandboxRunner();

for (const adapter of ServiceRegistry.list()) {
  registerAdapterTools(server, adapter, sandbox);
  // Registers all tools for this adapter
}
```

### Inside registerAdapterTools()

```typescript
export function registerAdapterTools(
  server: McpServer,
  adapter: ServiceAdapter,
  sandbox: SandboxRunner
): void {
  // 1. Register direct tools
  if (adapter.directTools) {
    for (const tool of adapter.directTools) {
      server.tool(`${adapter.name}_${tool.name}`, { ... }, tool.handler);
    }
  }

  // 2. Register search_docs tool
  server.tool(`${adapter.name}_search_docs`, { ... }, (params) => {
    const results = searchDocs(adapter.docs, params.query);
    return results;
  });

  // 3. Register execute tool
  server.tool(`${adapter.name}_execute`, { ... }, async (params) => {
    return await sandbox.execute(params.code, {
      [adapter.name]: adapter.facade
    });
  });
}
```

## Tool Handler Patterns

### Direct Tool Handler

```typescript
const handler = async (params: Record<string, unknown>) => {
  try {
    const result = await facade.method(params.arg1, params.arg2);
    return result;
  } catch (error) {
    return `Error: ${error.message}`;
  }
};
```

### Search Docs Handler

```typescript
const handler = (params: Record<string, unknown>) => {
  const query = params.query as string;
  const matches = fuseIndex.search(query);
  return matches
    .map(m => m.item)
    .slice(0, 10); // Top 10 matches
};
```

### Execute Handler

```typescript
const handler = async (params: Record<string, unknown>) => {
  const code = params.code as string;
  try {
    const result = await sandbox.execute(code, {
      [service]: facade  // Make facade available as service name
    });
    return result;
  } catch (error) {
    return `Execution failed: ${error.message}`;
  }
};
```

## MCP Tool Format

Each tool registered with the MCP server conforms to:

```typescript
server.tool(
  name: string,                    // e.g., "jira_search"
  {
    description: string,           // Shown in tool list
    parameters: {                  // Parameter schema
      type: "object",
      properties: {
        paramName: {
          type: "string",
          description: "..."
        }
      },
      required: ["paramName"]
    }
  },
  handler: (params) => Promise<unknown>  // Handler function
);
```

## Optimization Considerations

### Direct Tools Preferred For
- Frequently called operations
- Latency-sensitive queries
- Simple parameter-to-result mappings
- When sandbox overhead is unacceptable

### Code Execution Preferred For
- Complex multi-step operations
- Data transformation and filtering
- Service orchestration
- When logic cannot be pre-written

### Caching Opportunities
- Index adapter.docs once at registration (currently done per search)
- Cache facade introspection
- Sandbox pooling for faster reuse

## Troubleshooting

### Tool not appearing in Copilot
1. Check adapter is registered in `mcp-server.ts`
2. Verify adapter conforms to `ServiceAdapter` interface
3. Run `npm run build` to recompile
4. Restart VS Code

### Tool execution fails with "Unknown tool"
- Tool name doesn't match pattern: `{service}_{name}`
- Check spelling and service name in registry
- Verify adapter `name` property matches

### Search returns no results
- Query terminology doesn't match documentation
- Documentation might use different terms
- Check `adapter.docs` structure matches expected format

### Code execution times out
- User code takes >30 seconds
- Infinite loop in generated code
- Too much data being processed
- See [Sandbox troubleshooting](sandbox.md#troubleshooting)

## Future Enhancements

- Tool versioning and deprecation
- Tool usage analytics
- Performance profiling per tool
- Conditional tool registration (enable/disable per environment)
- Tool parameter validation schemas auto-generated from TypeScript types
- Tool documentation auto-generated from JSDoc comments
