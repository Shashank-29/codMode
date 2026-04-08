/**
 * Jira Capability Docs — content for the search_docs tool.
 *
 * This must be concise (<1000 tokens). The model uses this
 * to discover what methods are available before writing code.
 */

export function jiraDocs(): string {
  return `# Jira Facade Methods

## Read Operations

### getIssue(issueKey: string)
Get full issue details by key.
Example: await jira.getIssue("PROJ-123")

### searchIssues(jql: string, maxResults?: number)
Search issues using JQL. Returns summarized issues.
Example: await jira.searchIssues("project = MYAPP AND status = 'In Progress'")
Returns: [{ key, summary, status, assignee, priority, issuetype, created, updated, duedate }]

### getMyBlockers(assignee?: string)
Get blocked issues for a user. Defaults to current user.
Example: await jira.getMyBlockers("john.doe")

### getSprintSummary(boardId: number)
Get active sprint health metrics — total issues, status breakdown.
Example: await jira.getSprintSummary(42)
Returns: { sprint, totalIssues, statusBreakdown: { "To Do": 5, "In Progress": 3 } }

### getFieldId(fieldName: string)
Resolve custom field name to ID. Cached per session.
Example: await jira.getFieldId("Story Points") → "customfield_10032"

## Write Operations

### moveIssueToStatus(issueKey: string, statusName: string)
Move issue to a new status. Resolves transition ID automatically.
Example: await jira.moveIssueToStatus("PROJ-123", "In Progress")

### addComment(issueKey: string, text: string)
Add a comment (uses Jira markup, NOT Markdown).
Jira markup: *bold* _italic_ {code}block{code} h1. heading
Example: await jira.addComment("PROJ-123", "PR is ready for review")

### createIssue(project: string, issueType: string, summary: string, description?: string)
Create a new issue.
Example: await jira.createIssue("MYAPP", "Bug", "Login page crashes on Safari")

### assignIssue(issueKey: string, username: string)
Assign an issue to a user.
Example: await jira.assignIssue("PROJ-123", "john.doe")

## Discovery

### discoverEntities(scope: string, query: string)
Fuzzy-search boards, projects, issue types, or statuses.
Scopes: "boards", "projects", "issuetypes", "statuses"
Example: await jira.discoverEntities("boards", "mobile app")

## Notes
- Write operations require JIRA_READONLY=false
- Comments use Jira markup: *bold* _italic_ -strikethrough- {code}code{code}
- JQL uses project KEYS (e.g. "MYAPP"), not display names
`;
}
