# Sandbox Runner

Orchestrates safe execution of user-generated JavaScript code within an isolated V8 Isolate sandbox environment.

## Purpose

The Sandbox Runner:
- Executes user-generated code in a locked V8 context
- Injects facade methods for service access
- Enforces resource limits (CPU time, memory)
- Prevents access to externals (filesystem, network, process)
- Logs execution and potentially dangerous operations through the Policy engine
- Returns results securely to the MCP server

## Location

- **Main File**: [core/sandbox/runner.ts](../../core/sandbox/runner.ts)
- **Policy Engine**: [core/sandbox/policy.ts](../../core/sandbox/policy.ts)
- **Dependency**: `isolated-vm` package (npm)

## How It Works

### Execution Flow

```
1. Copilot calls jira_execute with user code
   ↓
2. Tool handler extracts code and calls runner.execute()
   ↓
3. Sandbox creates isolated V8 Isolate
   ↓
4. Inject facade methods into sandbox context
   ↓
5. Set timeout (30s) and memory limit (128MB)
   ↓
6. Execute code string
   ↓
7. Policy engine inspects execution for violations
   ↓
8. Return result or error to caller
   ↓
9. Clean up isolate
```

## Configuration

### Timeout
- **Default**: 30 seconds
- **Purpose**: Prevent infinite loops and runaway operations
- **Consequence**: Exceeding timeout throws `TimeoutError`

### Memory Limit
- **Default**: 128 MB
- **Purpose**: Prevent memory exhaustion attacks
- **Consequence**: Exceeding limit throws memory error

### Injected Facades

The runner injects all facade methods from registered services into the sandbox context before execution:

```javascript
// Inside sandbox, user code can access:
const jira = { getIssue, search, discover, ... };
const tasks = { getTask, list, stats, ... };
const sql = { query, getSchema, ... };

// And write procedural code:
const issues = await jira.search({ jql: "project = MYAPP" });
const open = issues.filter(i => i.status === 'Open');
return open.slice(0, 5);
```

## Security Model

### Isolation Guarantees

✅ **Sandbox CANNOT Access**:
- Filesystem (no `fs` module)
- Process environment variables
- Network directly (only through facade)
- Other running processes
- Node.js internals

✅ **Sandbox CAN Access**:
- Injected facade methods (pre-authenticated)
- Native JavaScript (Array, Object, String, etc.)
- Async/await
- Promises and callbacks

### Credential Handling

**Critical Security Principle**: Credentials are NEVER passed into the sandbox.

- Credentials are bound to facade methods at **instantiation time** (startup)
- Facade methods already have auth headers, tokens, or connection strings embedded
- User code only calls pre-authenticated methods
- Even if user code is malicious, it cannot access raw credentials

**Example**:
```typescript
// At startup (outside sandbox):
const jiraFacade = new JiraFacade(); // Takes JIRA_API_TOKEN from env
// Token is now part of instance, never passed to sandbox

// In sandbox (user-generated):
const issues = await jira.search(...); // Calls pre-authenticated method
// User code never sees the token
```

## Policy Engine

Located in [policy.ts](../../core/sandbox/policy.ts), the policy engine:
- Flags potentially dangerous operations
- Logs violations for audit trail
- Does NOT block execution (for now)
- Can be extended to enforce stricter policies

### Current Policies

**Mutation Detection**:
- Flags operations that modify state (create, update, delete)
- Helps identify unintended side effects

**Resource Warnings**:
- Logs if memory usage exceeds thresholds
- Logs if execution approaches timeout

## API

### `runner.execute(code: string, facades: Record<string, any>, options?: ExecutionOptions): Promise<any>`

Execute code string with access to injected facades.

**Parameters**:
- `code` — JavaScript code string to execute
- `facades` — Object mapping service names to facade instances
- `options` (optional):
  - `timeout` — Custom timeout in milliseconds (default: 30000)
  - `memoryLimit` — Custom memory limit in MB (default: 128)

**Returns**: Promise resolving to the result of the code's last expression

**Throws**:
- `TimeoutError` — Execution exceeded timeout
- `Error` — JavaScript runtime error or policy violation

**Example**:
```typescript
const result = await sandbox.execute(
  `await jira.search({ jql: "project = MYAPP" });`,
  { jira: jiraFacade, tasks: tasksFacade }
);
```

## Patterns and Best Practices

### ✅ Writing Safe User Code

```javascript
// Good: Use injected facades
const issue = await jira.getIssue("PROJ-123");

// Good: Transform data
const filtered = issues.filter(i => i.priority === 'High');

// Good: Async/await chains
const task = await tasks.getTask(taskId);
const relatedIssues = await jira.search({...});
return { task, issues: relatedIssues };
```

### ❌ Dangerous Patterns

```javascript
// Bad: Trying to access process
process.env.SECRET; // → undefined (no process)

// Bad: Trying filesystem
require('fs').readFile(...); // → Error (no fs module)

// Bad: Infinite loops
while(true) { } // → TimeoutError after 30s

// Bad: Memory exhaustion
const arr = new Array(1e9); // → Memory error at 128MB
```

## Performance Characteristics

- **Startup overhead**: ~5-10ms per sandbox creation
- **Injection overhead**: ~1-2ms to inject facades
- **Code execution**: Depends on code complexity
- **Cleanup**: ~2-3ms per sandbox destruction
- **Reuse**: Sandbox is reused for multiple executions (pool in future)

## Testing

### Test Execution Environment

The [test-client.ts](../../test-client.ts) demonstrates sandbox usage:

```typescript
const result = await sandbox.execute(
  `
    const issues = await jira.search({ jql: "project = TEST" });
    return issues.length;
  `,
  { jira: jiraFacade }
);
console.log(`Found ${result} issues`);
```

## Troubleshooting

### "TimeoutError: Script exceeded timeout"
- Code is taking too long (>30s)
- Check for infinite loops or blocking operations
- Reduce dataset size or optimize query

### "Memory exhaustion"
- Code is allocating too much memory (>128MB)
- Reduce array/object sizes
- Stream data instead of loading all at once

### Code works locally but not in sandbox
- Sandbox doesn't have access to globals like `window`, `document`, or certain Node.js modules
- Use only injected facades and native JavaScript

## Future Enhancements

- Sandbox pooling for faster reuse
- Custom timeout per service
- Memory profiling and reporting
- Execution history and replay
- Concurrent execution limits
- Nested service calls (service A calls service B through sandbox)
