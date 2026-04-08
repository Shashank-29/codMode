/**
 * Jira Service Adapter — registers Jira as a service in copilot-api-bridge.
 *
 * Exports:
 *   - JiraAdapter: ServiceAdapter conforming to the framework contract
 *   - 3 direct tools: jira_get_issue, jira_search, jira_discover
 */
import { z } from 'zod';
import { ServiceAdapter, DirectTool } from '../../core/registry/types.js';
import { JiraFacade } from './facade/jira.js';
import { jiraDocs } from './docs/capabilities.js';

const facade = new JiraFacade();

// ── Direct Tools ──────────────────────────────────────────────

const getIssueTool: DirectTool = {
  name: 'get_issue',
  description:
    'Get full details of a Jira issue by key. Returns all fields including custom fields.',
  parameters: {
    issueKey: z
      .string()
      .describe('Issue key, e.g. "PROJ-123"'),
  },
  handler: async (params) => {
    return facade.getIssue(params.issueKey as string);
  },
};

const searchTool: DirectTool = {
  name: 'search',
  description: `Search Jira issues using JQL (Jira Query Language).
Returns summarized issues with key, summary, status, assignee, priority.

IMPORTANT: JQL uses project KEYS (e.g. "MYAPP"), NOT display names.
If you don't know the project key, use jira_discover first.

JQL examples:
  - "project = MYAPP ORDER BY created DESC"
  - "project = MYAPP AND status = 'In Progress'"
  - "assignee = currentUser() AND resolution = Unresolved"
  - "sprint in openSprints() AND project = MYAPP"`,
  parameters: {
    jql: z.string().describe('JQL query string'),
    maxResults: z
      .number()
      .optional()
      .describe('Max results (default: 50)'),
  },
  handler: async (params) => {
    return facade.searchIssues(
      params.jql as string,
      (params.maxResults as number) || 50
    );
  },
};

const discoverTool: DirectTool = {
  name: 'discover',
  description: `Fuzzy-search Jira entities: boards, projects, issue types, or statuses.
Handles typos and partial matches. Returns top 5 results.
Use scope="boards" FIRST — boards are the primary organizing unit.`,
  parameters: {
    scope: z
      .enum(['boards', 'projects', 'issuetypes', 'statuses'])
      .describe('What to search'),
    query: z
      .string()
      .describe('Search term — tolerates typos'),
  },
  handler: async (params) => {
    const results = await facade.discoverEntities(
      params.scope as string,
      params.query as string
    );
    return results.join('\n');
  },
};

// ── Adapter Export ─────────────────────────────────────────────

/**
 * Build the facade methods object for sandbox injection.
 * Each method is bound to the facade instance.
 */
function buildFacadeMethods(): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return {
    getIssue: (key: unknown) => facade.getIssue(key as string),
    searchIssues: (jql: unknown, max?: unknown) =>
      facade.searchIssues(jql as string, max as number | undefined),
    getMyBlockers: (assignee?: unknown) =>
      facade.getMyBlockers(assignee as string | undefined),
    getSprintSummary: (boardId: unknown) =>
      facade.getSprintSummary(boardId as number),
    getFieldId: (name: unknown) =>
      facade.getFieldId(name as string),
    moveIssueToStatus: (key: unknown, status: unknown) =>
      facade.moveIssueToStatus(key as string, status as string),
    addComment: (key: unknown, text: unknown) =>
      facade.addComment(key as string, text as string),
    createIssue: (project: unknown, type: unknown, summary: unknown, desc?: unknown) =>
      facade.createIssue(
        project as string,
        type as string,
        summary as string,
        desc as string | undefined
      ),
    assignIssue: (key: unknown, username: unknown) =>
      facade.assignIssue(key as string, username as string),
    discoverEntities: (scope: unknown, query: unknown) =>
      facade.discoverEntities(scope as string, query as string),
  };
}

export const JiraAdapter: ServiceAdapter = {
  name: 'jira',
  description: 'Jira project management — issues, sprints, boards, workflows',
  facade: buildFacadeMethods(),
  docs: jiraDocs,
  directTools: [getIssueTool, searchTool, discoverTool],
};
