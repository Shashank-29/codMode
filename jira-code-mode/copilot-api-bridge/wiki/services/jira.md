# Jira Service

Integration with Jira Cloud for issue tracking, searching, and discovery.

## Overview

The Jira service exposes Jira's REST API through a typed facade, enabling Copilot to search issues, retrieve details, and discover project information.

## Endpoints and Direct Tools

### `jira_get_issue` — Get Full Issue Details

**Parameters**:
- `issueKey` (string, required) — Issue key, e.g., "PROJ-123"

**Returns**: Complete issue object with all fields, custom fields, comments history.

**Use Cases**:
- Fetch issue by key for detailed analysis
- Get current status and assignee
- Retrieve custom field values
- View issue history and transitions

**Example**:
```
User: "What is the status of PROJ-456?"
Copilot calls: jira_get_issue(issueKey="PROJ-456")
Response: { key: "PROJ-456", summary: "...", status: "In Progress", ... }
```

### `jira_search` — Search Issues by JQL

**Parameters**:
- `jql` (string, required) — JQL (Jira Query Language) query
- `maxResults` (number, optional) — Maximum results to return (default: 50)

**Returns**: Array of summarized issue objects.

**JQL Guide**:
- Project key (not display name): `project = PROJ`
- Status: `status = 'In Progress'`
- Assignee: `assignee = currentUser()` or `assignee = username`
- Priority: `priority = High`
- Sprint: `sprint in openSprints()`
- Date range: `created >= -7d`
- Complex: `project = PROJ AND status = Open AND assignee is EMPTY`

**Important**: Use project KEYS (e.g., "MYAPP"), not display names.

**Use Cases**:
- Find all open issues in a project
- Get issues assigned to current user
- Search by priority or status
- Find issues in active sprints

**Example**:
```
User: "Show me all open issues in MYAPP"
Copilot calls: jira_search(jql="project = MYAPP AND status = Open")
Response: [ { key: "MYAPP-1", summary: "...", status: "Open" }, ... ]
```

### `jira_discover` — List Projects and Statuses

**Parameters**: None

**Returns**: Discovery data including:
- All accessible projects (keys, names, descriptions)
- Available statuses and transitions
- Priority levels
- Issue type definitions

**Use Cases**:
- Find project key when you know the display name
- Understand available statuses for project
- Discover priority levels used in organization
- Understand issue type hierarchy

**Example**:
```
User: "What projects are available?"
Copilot calls: jira_discover()
Response: {
  projects: [
    { key: "PROJ", name: "My Project", ... },
    { key: "INFRA", name: "Infrastructure", ... }
  ],
  statuses: ["Open", "In Progress", "Done"],
  priorities: ["Low", "Medium", "High", "Critical"]
}
```

## Auto-Generated Tools

### `jira_search_docs` — Semantic Search

Search the Jira capability documentation to find relevant methods.

**Example**:
```
Copilot: "How do I search for issues?"
jira_search_docs(query="search issue")
Response: [
  { name: "search", description: "Search using JQL...", ... },
  { name: "getIssue", description: "Get full issue details...", ... }
]
```

### `jira_execute` — Code Execution

Execute user-generated JavaScript with access to the Jira facade.

**Example**:
```
User: "Find all high-priority issues assigned to me in MYAPP"
Copilot generates:
  const jql = "project = MYAPP AND assignee = currentUser() AND priority = High";
  const issues = await jira.search({ jql });
  return issues.map(i => ({ key: i.key, summary: i.summary }));
```

## Facade Methods

The `JiraFacade` class exposes:

```typescript
class JiraFacade {
  async getIssue(issueKey: string): Promise<IssueDetail>;
  async search(jql: string, maxResults?: number): Promise<SearchResult>;
  async discover(): Promise<DiscoveryData>;
}
```

All authentication is handled internally. The facade cannot be invoked outside the bridge.

## Authentication

**Mechanism**: API Token authentication via HTTP headers.

**Setup**:
1. Generate Jira API token from account settings
2. Add to `.env`: `JIRA_API_TOKEN=your_token_here`
3. Add to `.env.example` for documentation

**Security**: Token is never exposed to Copilot or sandbox. It's bound to the facade at instantiation.

## Documentation

The capability documentation shows:

- **getIssue** method:
  - Parameters: `issueKey` (string)
  - Example: `getIssue("PROJ-123")`
  - Returns: Full issue object with all fields
  
- **search** method:
  - Parameters: `jql` (string), `maxResults` (optional number)
  - Example: `search("project = PROJ AND status = Open")`
  - Returns: Array of issue summaries
  
- **discover** method:
  - Parameters: None
  - Returns: Projects, statuses, priorities, issue types

## Examples

### Find unresolved issues assigned to me
```javascript
const jql = "assignee = currentUser() AND resolution = Unresolved";
const issues = await jira.search({ jql, maxResults: 100 });
return issues.filter(i => i.priority === 'High');
```

### Get issue details and count subtasks
```javascript
const issue = await jira.getIssue("PROJ-123");
const subtasks = issue.fields.subtasks || [];
return {
  key: issue.key,
  title: issue.fields.summary,
  status: issue.fields.status.name,
  subtaskCount: subtasks.length
};
```

### List all projects and their issue counts
```javascript
const discovery = await jira.discover();
const projects = discovery.projects;
return projects.map(p => ({
  key: p.key,
  name: p.name
})).slice(0, 10);
```

## Error Handling

**Common Errors**:

| Error | Cause | Solution |
|-------|-------|----------|
| 404 Not Found | Issue key doesn't exist | Verify key format and spelling |
| 401 Unauthorized | API token invalid or expired | Check `JIRA_API_TOKEN` in `.env` |
| 400 Bad Request | JQL query syntax error | Review JQL syntax; use jira_discover for valid statuses |
| 403 Forbidden | Insufficient permissions | User doesn't have access to project or issue |

## Configuration

### Environment Variables

```env
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_API_TOKEN=XXXX_XXXX_XXXX
```

### Rate Limits

Jira Cloud enforces rate limits:
- Event API calls: 1000 per hour
- Search/Get: Limited by shared quota

The facade does not currently implement backoff/retry. High-volume operations should be batched.

## Location

- **Facade**: [services/jira/facade/jira.ts](../../services/jira/facade/jira.ts)
- **Documentation**: [services/jira/docs/capabilities.ts](../../services/jira/docs/capabilities.ts)
- **Adapter**: [services/jira/index.ts](../../services/jira/index.ts)

## Testing

### Manual Test

```bash
npm run dev  # Start MCP server

# In VS Code Copilot Chat:
# "What is PROJ-123?"
# jira_get_issue should return the issue details
```

### Test Client

See [test-client.ts](../../test-client.ts) for example usage.

## Known Limitations

- No mutation support yet (create/update/delete issues)
- No webhook subscriptions
- No real-time updates
- Search results limited to 50 by default (configurable)
- Custom field formatting may vary
- Parent-child issue navigation is manual (through JQL)

## Future Enhancements

- Create/update/delete issue operations
- Bulk operations (e.g., bulk update status)
- Issue linking and dependency tracking
- Comment and attachment management
- Workflow transition automation
- Sprint planning and assignment
- Backlog management
- Agile reporting (burndown, velocity)
