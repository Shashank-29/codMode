/**
 * Tasks Capability Docs — content for the search_docs tool.
 * Under 1,000 tokens.
 */

export function tasksDocs(): string {
  return `# Tasks Facade Methods

## Read Operations

### getTask(taskId: string)
Get full task details by ID.
Example: await tasks.getTask("t1")

### listTasks(filters?: { status, priority, assignee, tag })
List tasks with optional filters.
Example: await tasks.listTasks({ status: "in_progress" })
Example: await tasks.listTasks({ priority: "critical" })
Returns: [{ id, title, status, priority, assignee, tags, createdAt, updatedAt }]

### getStats()
Get aggregate stats — total, by status, by priority, unassigned count.
Example: await tasks.getStats()
Returns: { total, byStatus: { todo, in_progress, done }, byPriority: { low, medium, high, critical }, unassigned }

### listUsers()
List all users.
Example: await tasks.listUsers()
Returns: [{ id, name, email, role }]

### healthCheck()
Check if the service is running.
Example: await tasks.healthCheck()

## Write Operations

### createTask(title: string, priority?: string, description?: string, tags?: string[])
Create a new task. Defaults to status "todo" and priority "medium".
Example: await tasks.createTask("Fix login bug", "critical", "Users can't log in on Safari", ["bug", "frontend"])

### updateTask(taskId: string, updates: { title?, description?, status?, priority?, tags? })
Update specific fields of a task.
Example: await tasks.updateTask("t1", { priority: "critical", tags: ["urgent"] })

### moveTask(taskId: string, status: string)
Change a task's status. Status values: "todo", "in_progress", "done".
Example: await tasks.moveTask("t1", "done")

### assignTask(taskId: string, userId: string)
Assign a task to a user.
Example: await tasks.assignTask("t1", "u2")

### deleteTask(taskId: string)
Permanently delete a task.
Example: await tasks.deleteTask("t5")
`;
}
