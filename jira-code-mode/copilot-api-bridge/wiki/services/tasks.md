# Tasks Service

Internal task management system providing task creation, retrieval, filtering, and statistics.

## Overview

The Tasks service is a lightweight in-memory task database (currently), enabling Copilot to list, retrieve, and analyze tasks with flexible filtering and statistics.

## Endpoints and Direct Tools

### `tasks_get_task` — Get Full Task Details

**Parameters**:
- `taskId` (string, required) — Task ID, e.g., "t1"

**Returns**: Complete task object with all fields including creation time, assignee, tags, and history.

**Use Cases**:
- Retrieve full task details by ID
- Check task status and priority
- View assignee and due date
- See task relationships and dependencies

**Example**:
```
User: "What is task t5?"
Copilot calls: tasks_get_task(taskId="t5")
Response: {
  id: "t5",
  title: "Implement auth",
  status: "in_progress",
  priority: "high",
  assignee: "alice",
  ...
}
```

### `tasks_list` — List Tasks with Filters

**Parameters** (all optional):
- `status` — Filter by status: `"todo" | "in_progress" | "done"`
- `priority` — Filter by priority: `"low" | "medium" | "high" | "critical"`
- `assignee` — Filter by assignee user ID
- `tag` — Filter by tag

**Returns**: Array of task objects matching all filters.

**Filtering**:
- Omit filter to include all values
- Combine multiple filters with AND logic
- Example: `status="in_progress" AND priority="high"`

**Use Cases**:
- List all open tasks
- Find tasks assigned to a user
- Group tasks by priority
- Find urgent tasks
- Filter by tags (e.g., "backend", "frontend")

**Example**:
```
User: "Show me all high-priority tasks assigned to me"
Copilot calls: tasks_list(priority="high", assignee="alice")
Response: [ { id: "t3", ... }, { id: "t7", ... } ]
```

**Example (No Filter)**:
```
User: "How many tasks total?"
Copilot calls: tasks_list({})  // Empty object = no filters
Response: [ task1, task2, task3, ..., taskN ]
```

### `tasks_stats` — Get Task Statistics

**Parameters**: None

**Returns**: Statistics object:
```typescript
{
  totalCount: number,
  byStatus: {
    todo: number,
    in_progress: number,
    done: number
  },
  byPriority: {
    low: number,
    medium: number,
    high: number,
    critical: number
  },
  unassignedCount: number
}
```

**Use Cases**:
- Get overall task health snapshot
- See distribution by status
- Understand priority breakdown
- Identify unassigned work

**Example**:
```
User: "Give me a summary of all tasks"
Copilot calls: tasks_stats()
Response: {
  totalCount: 42,
  byStatus: {
    todo: 15,
    in_progress: 20,
    done: 7
  },
  unassignedCount: 3
}
```

## Auto-Generated Tools

### `tasks_search_docs` — Semantic Search

Search the Tasks capability documentation to find relevant methods.

**Example**:
```
Copilot: "How do I find tasks by priority?"
tasks_search_docs(query="filter by priority")
Response: [
  { name: "list", description: "List tasks with optional filters...", ... }
]
```

### `tasks_execute` — Code Execution

Execute user-generated JavaScript with access to the Tasks facade.

**Example**:
```
User: "Find all unassigned high-priority tasks"
Copilot generates:
  const tasks = await tasks.list({ priority: "high" });
  return tasks.filter(t => !t.assignee);
```

## Facade Methods

The `TasksFacade` class exposes:

```typescript
class TasksFacade {
  async getTask(taskId: string): Promise<Task>;
  async listTasks(filters?: TaskFilters): Promise<Task[]>;
  async getStats(): Promise<TaskStats>;
}
```

All operations are synchronous in-memory lookups (no network calls).

## Task Object Structure

```typescript
interface Task {
  id: string;                  // e.g., "t1"
  title: string;               // e.g., "Implement auth"
  description: string;         // Optional long text
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "critical";
  assignee?: string;           // User ID or undefined if unassigned
  dueDate?: string;            // ISO date string or undefined
  tags: string[];              // e.g., ["backend", "auth"]
  createdAt: string;           // ISO timestamp
  updatedAt: string;           // ISO timestamp
}
```

## Data Storage

**Current**: In-memory database (no persistence).

**Implication**: Tasks are reset on server restart. Suitable for prototyping and testing.

**Future**: Integration with persistent database (PostgreSQL, MongoDB, Azure Cosmos).

## Documentation

The capability documentation shows:

- **getTask** method:
  - Parameters: `taskId` (string)
  - Example: `getTask("t5")`
  - Returns: Complete task object
  
- **listTasks** method:
  - Parameters: `filters` (optional)
  - Example: `listTasks({ status: "todo", priority: "high" })`
  - Returns: Array of matching tasks
  - Filters combine with AND logic
  
- **getStats** method:
  - Parameters: None
  - Returns: Statistics breakdown by status and priority

## Examples

### Find high-priority work not yet started
```javascript
const tasks = await tasks.list({ status: "todo", priority: "high" });
return tasks.sort((a, b) => 
  new Date(b.dueDate) - new Date(a.dueDate)
);
```

### Count unassigned critical work
```javascript
const criticalTasks = await tasks.list({ priority: "critical" });
const unassigned = criticalTasks.filter(t => !t.assignee);
return {
  count: unassigned.length,
  tasks: unassigned.map(t => t.id)
};
```

### Group tasks by assignee
```javascript
const allTasks = await tasks.list({});
const byAssignee = {};
allTasks.forEach(t => {
  const who = t.assignee || "unassigned";
  byAssignee[who] = byAssignee[who] || [];
  byAssignee[who].push(t.id);
});
return byAssignee;
```

### Find overdue tasks
```javascript
const allTasks = await tasks.list({});
const now = new Date();
return allTasks.filter(t => 
  t.dueDate && new Date(t.dueDate) < now && t.status !== "done"
);
```

## Error Handling

**Common Errors**:

| Error | Cause | Solution |
|-------|-------|----------|
| Task not found | ID doesn't exist | Verify task ID with tasks_list() first |
| Invalid status | Status value not in enum | Use: `"todo" \| "in_progress" \| "done"` |
| Invalid priority | Priority value not in enum | Use: `"low" \| "medium" \| "high" \| "critical"` |

## Configuration

No environment configuration needed. Tasks service is self-contained.

## Location

- **Facade**: [services/tasks/facade/tasks.ts](../../services/tasks/facade/tasks.ts)
- **Documentation**: [services/tasks/docs/capabilities.ts](../../services/tasks/docs/capabilities.ts)
- **Adapter**: [services/tasks/index.ts](../../services/tasks/index.ts)

## Testing

### Manual Test

```bash
npm run dev  # Start MCP server

# In VS Code Copilot Chat:
# "How many tasks total?"
# tasks_stats should return statistics
# "List all high-priority tasks"
# tasks_list should return filtered tasks
```

## Known Limitations

- No persistence (data lost on restart)
- No task creation/update/delete operations yet
- No relationship tracking between tasks
- No notification system
- No task templates
- No recurring tasks

## Future Enhancements

- Persistent database storage
- Task creation and mutation
- Subtask and dependency management
- Recurring task patterns
- Task templates and cloning
- Time tracking and estimates
- Collaboration and mentions
- Webhooks and event streaming
- Bulk operations
- Task archival and cleanup
- Integration with calendar/scheduling
