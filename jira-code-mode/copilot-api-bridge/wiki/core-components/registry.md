# Service Registry

Central component responsible for registering, discovering, and managing all active service adapters.

## Purpose

The Service Registry acts as a catalog and factory for service adapters. It:
- Maintains a registry of all active services
- Prevents duplicate service names
- Provides discovery methods for the tool factory
- Enables loose coupling between services and the MCP server

## Location

- **File**: [core/registry/service-registry.ts](../../core/registry/service-registry.ts)
- **Type Definition**: [core/registry/types.ts](../../core/registry/types.ts)

## Usage

### Registration (at startup in mcp-server.ts)

```typescript
import { JiraAdapter } from './services/jira/index.js';
import { TasksAdapter } from './services/tasks/index.js';

// Register adapters
ServiceRegistry.register(JiraAdapter);
ServiceRegistry.register(TasksAdapter);
```

If a service with the same name is registered twice, an error is thrown:
```
Error: Service "jira" is already registered. Each service must have a unique name.
```

### Discovery (from tool factory)

```typescript
// Get all registered services
const allAdapters = ServiceRegistry.list();

// Get a specific adapter
const jiraAdapter = ServiceRegistry.get('jira');

// Get count
const serviceCount = ServiceRegistry.size; // 3
```

## ServiceAdapter Interface

Every registered adapter must conform to the `ServiceAdapter` interface:

```typescript
export interface ServiceAdapter {
  // Short identifier, must be unique: "jira", "sql", "tasks"
  name: string;

  // Human-readable description shown in Copilot tool lists
  description: string;

  // The facade object — record of callable methods
  facade: Record<string, (...args: any[]) => Promise<unknown>>;

  // Documentation for Copilot: capability descriptions and examples
  docs: unknown; // typed as any, but conventionally an object with methods array

  // Direct tools (optional) — high-speed lookups
  directTools?: DirectTool[];
}
```

## Current Registered Services

### 1. jira
- **Name**: "jira"
- **Description**: "Jira issue tracking integration"
- **Direct Tools**: `jira_get_issue`, `jira_search`, `jira_discover`
- **Auto Tools**: `jira_search_docs`, `jira_execute`

### 2. tasks
- **Name**: "tasks"
- **Description**: "Task management and tracking service"
- **Direct Tools**: `tasks_get_task`, `tasks_list`, `tasks_stats`
- **Auto Tools**: `tasks_search_docs`, `tasks_execute`

### 3. sql
- **Name**: "sql"
- **Description**: "Azure SQL Server integration for direct database access"
- **Direct Tools**: `sql_sql_schema`, `sql_sql_query`
- **Auto Tools**: `sql_search_docs`, `sql_execute`

## Implementation Details

### Singleton Pattern

The registry is a singleton, ensuring only one instance exists throughout the application lifetime:

```typescript
class ServiceRegistryImpl {
  private adapters = new Map<string, ServiceAdapter>();
  
  register(adapter: ServiceAdapter): void { ... }
  get(name: string): ServiceAdapter | undefined { ... }
  list(): ServiceAdapter[] { ... }
  get size(): number { ... }
}

export const ServiceRegistry = new ServiceRegistryImpl();
```

### Memory Model

- **Storage**: `Map<string, ServiceAdapter>` — O(1) lookup by name
- **Initialization**: All adapters registered at server startup in `mcp-server.ts`
- **Lifetime**: Registry persists for entire server lifetime
- **Thread-safety**: Adapters are registered synchronously at startup, not modified after

## Adding a Service to the Registry

### Step 1: Create adapter
Create a service directory with facade, docs, and index at:
```
services/{name}/
  ├── facade/{name}.ts
  ├── docs/capabilities.ts
  └── index.ts (exports ServiceAdapter)
```

### Step 2: Import and register
In [mcp-server.ts](../../mcp-server.ts):

```typescript
import { NewServiceAdapter } from './services/{name}/index.js';

ServiceRegistry.register(NewServiceAdapter);
```

### Step 3: Verify
The tool factory automatically discovers and registers the adapter's tools.

Run `npm run build` to ensure no TypeScript errors, then restart VS Code.

## Troubleshooting

### "Service X is already registered"
**Cause**: The same name was registered twice.  
**Solution**: Check `mcp-server.ts` for duplicate `register()` calls. Each service name must be unique.

### Service doesn't appear in Copilot tools
**Cause**: Service registered but tools not showing up.  
**Solution**: 
1. Check `mcp-server.ts` has the import and register call
2. Run `npm run build` to recompile
3. Restart VS Code to reload the MCP server
4. Check console output for "[Registry] Registered service: {name}"

## Performance Characteristics

- **Registration Time**: O(1) per service (Map insert)
- **Discovery Time**: O(n) where n = number of services (list enumeration)
- **Memory**: Minimal — only stores adapter references, not data
- **Scalability**: Can efficiently handle 50+ services

## Future Enhancements

- Service hot-reloading without server restart
- Service dependency graph (service A calls B)
- Registry versioning and compatibility checks
- Adapter profiling and usage statistics
