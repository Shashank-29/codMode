/**
 * MCP Server for Jira Code Mode.
 *
 * 3 MCP tools:
 *   1. jira_search — JQL search returning summarized issues
 *   2. jira_execute — Direct Jira REST API proxy
 *   3. code_execution — V8 sandbox with jira_search() + jira_api() injected
 *
 * PAT auth: extracted from X-Jira-PAT header (sent by VS Code via mcp.json inputs).
 * Jira URL: from JIRA_URL env var.
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {IncomingMessage, ServerResponse} from 'http';
import {z} from 'zod';
import {JiraService} from './services/jira.service';
import {V8SandboxService} from './services/v8-sandbox.service';

const sandboxService = new V8SandboxService();

/**
 * Create JiraService from request headers + env.
 */
function getJiraService(req: IncomingMessage): JiraService {
  const pat = req.headers['x-jira-pat'] as string;
  const baseUrl = process.env.JIRA_URL || '';

  if (!pat) {
    throw new Error(
      'Missing X-Jira-PAT header. Configure PAT in VS Code mcp.json inputs.',
    );
  }
  if (!baseUrl) {
    throw new Error(
      'Missing JIRA_URL env var. Set it in .env file.',
    );
  }

  return new JiraService(baseUrl, pat);
}

function createMcpServer(jiraService: JiraService): McpServer {
  const server = new McpServer({
    name: 'jira-code-mode',
    version: '1.0.0',
  });

  // ── Tool: jira_search ──────────────────────────────────────
  server.tool(
    'jira_search',
    `Search Jira issues using JQL (Jira Query Language).
Returns summarized issues with key, summary, status, assignee, priority.
Examples:
  - "project = TEST ORDER BY created DESC"
  - "assignee = currentUser() AND status = Open"
  - "type = Bug AND priority = High"`,
    {
      jql: z.string().describe('JQL query string'),
      maxResults: z
        .number()
        .optional()
        .describe('Max results to return (default: 50)'),
    },
    async ({jql, maxResults}) => {
      const issues = await jiraService.search(jql, undefined, maxResults ?? 50);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(issues, null, 2),
          },
        ],
      };
    },
  );

  // ── Tool: jira_execute ─────────────────────────────────────
  server.tool(
    'jira_execute',
    `Execute a direct Jira REST API call.
The path is relative to the Jira base URL. Common paths:
  - GET /rest/api/2/serverInfo — Server info
  - GET /rest/api/2/issue/{key} — Get issue details
  - POST /rest/api/2/issue — Create issue
  - PUT /rest/api/2/issue/{key} — Update issue
  - GET /rest/api/2/project — List all projects
  - GET /rest/api/2/issue/{key}/transitions — Get transitions
Note: write operations require JIRA_READONLY=false in .env`,
    {
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).describe('HTTP method'),
      path: z.string().describe('API path, e.g. /rest/api/2/serverInfo'),
      body: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Request body (for POST/PUT)'),
    },
    async ({method, path, body}) => {
      const result = await jiraService.request(method, path, body);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  // ── Tool: code_execution ───────────────────────────────────
  server.tool(
    'code_execution',
    `Execute JavaScript code in a secure V8 isolate sandbox with Jira tools injected.
Available inside the sandbox:
  - jira_search(jql) — Async, returns array of { key, summary, status, assignee, priority, ... }
  - jira_api(method, path, body) — Async, makes direct Jira REST calls
  - console.log(...args) — Captured and returned

Use this for multi-step Jira workflows:
  - Search + filter + transform issues
  - Bulk create/update operations
  - Cross-issue analysis and reporting
  - Chaining multiple API calls with logic

Example: "const issues = await jira_search('project = TEST'); console.log(issues.length + ' issues found');"

Timeout: 10s. Memory: 128MB. Write ops require JIRA_READONLY=false.`,
    {
      code: z.string().describe('JavaScript code to execute'),
    },
    async ({code}) => {
      const result = await sandboxService.execute(code, jiraService);

      if (result.error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${result.error}\n\nLogs:\n${result.logs.join('\n')}`,
            },
          ],
          isError: true,
        };
      }

      const parts: string[] = [];
      if (result.logs.length > 0) {
        parts.push(`Logs:\n${result.logs.join('\n')}`);
      }
      if (result.output && result.output !== 'undefined') {
        parts.push(`Result: ${result.output}`);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: parts.join('\n\n') || 'Code executed successfully (no output)',
          },
        ],
      };
    },
  );

  return server;
}

// Session management
const sessions = new Map<string, {transport: StreamableHTTPServerTransport; jiraService: JiraService}>();

export async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
    return;
  }

  // New session — extract Jira creds from headers
  let jiraService: JiraService;
  try {
    jiraService = getJiraService(req);
  } catch (err) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: (err as Error).message}));
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => `jira-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    onsessioninitialized: (id) => {
      sessions.set(id, {transport, jiraService});
      console.log(`[MCP] Jira session created: ${id}`);
    },
  });

  transport.onclose = () => {
    const id = [...sessions.entries()].find(([, s]) => s.transport === transport)?.[0];
    if (id) {
      sessions.delete(id);
      console.log(`[MCP] Jira session closed: ${id}`);
    }
  };

  const server = createMcpServer(jiraService);
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

export async function handleMcpGet(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'No valid session.'}));
    return;
  }
  await sessions.get(sessionId)!.transport.handleRequest(req, res);
}

export async function handleMcpDelete(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    await sessions.get(sessionId)!.transport.close();
    sessions.delete(sessionId);
    res.writeHead(200);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
}

export function disposeSandbox(): void {
  sandboxService.dispose();
}
