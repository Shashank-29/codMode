---
name: Jira Code Mode Agent
description: MCP agent for Jira 8.20.1 with V8 sandbox code execution
---

# Jira Code Mode MCP Agent

Local MCP server that provides tools for interacting with a self-hosted Jira 8.20.1 server,
including secure V8 sandbox code execution for complex multi-step workflows.

## Available Tools

### `jira_search`
Search Jira issues using JQL (Jira Query Language).

**Input:** `jql` (string), `maxResults` (optional, default 50)
**Output:** Array of issues with key, summary, status, assignee, priority

**Example:**
```
jira_search("project = TEST AND status = Open ORDER BY priority DESC")
```

### `jira_execute`
Execute a direct Jira REST API call.

**Input:** `method` (GET/POST/PUT/DELETE), `path` (string), `body` (optional)
**Output:** Raw API response

**Examples:**
```
jira_execute("GET", "/rest/api/2/serverInfo")
jira_execute("GET", "/rest/api/2/project")
jira_execute("POST", "/rest/api/2/issue", { "fields": { ... } })
```

### `code_execution`
Execute JavaScript in a V8 sandbox with Jira tools injected.

**Available in sandbox:**
- `jira_search(jql)` — async, returns issue array
- `jira_api(method, path, body)` — async, direct REST calls
- `console.log()` — captured output

**Example:**
```javascript
const bugs = await jira_search('type = Bug AND status = Open');
const byPriority = {};
bugs.forEach(b => {
  byPriority[b.priority] = (byPriority[b.priority] || 0) + 1;
});
console.log('Bug count by priority:', byPriority);
```

## Setup

1. Copy `.env.example` to `.env` and set `JIRA_URL`
2. Run `npm run build && npm start`
3. VS Code will prompt for your Jira PAT on first connection
4. Use Copilot Chat in Agent mode to interact with Jira
