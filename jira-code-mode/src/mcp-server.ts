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

  // ── Tool: jira_discover ────────────────────────────────────
  server.tool(
    'jira_discover',
    `Fuzzy-search your Jira instance for boards, projects, issue types, or statuses.
IMPORTANT: Every project, sub-project, and POC has a BOARD. Use scope="boards" FIRST to find what you need.
Boards are the primary organizing unit — they contain the backlog and sprints.
Once you have a board ID, use code_execution to query its backlog/sprints via the Agile API.
Handles typos and partial matches. Returns max 5 best matches.
For custom fields or components, use code_execution instead.`,
    {
      scope: z
        .enum(['boards', 'projects', 'issuetypes', 'statuses'])
        .describe('What to search — use "boards" first (primary), then "projects" if needed'),
      query: z
        .string()
        .describe('Search term — matches against names and keys, tolerates typos'),
    },
    async ({scope, query}) => {
      const Fuse = (await import('fuse.js')).default;
      let lines: string[] = [];

      if (scope === 'boards') {
        let boards: Array<Record<string, unknown>> = [];

        // Strategy 1: If query looks like a project key (ALL CAPS), filter server-side
        const isProjectKey = /^[A-Z][A-Z0-9_]+$/.test(query);
        if (isProjectKey) {
          try {
            const resp = (await jiraService.request(
              'GET',
              `/rest/agile/1.0/board?projectKeyOrId=${query}&maxResults=50`,
            )) as Record<string, unknown>;
            boards = (resp.values || []) as Array<Record<string, unknown>>;
          } catch {
            // Project key might not match, fall through to name search
          }
        }

        // Strategy 2: Search by board name (server-side name filter + fuzzy)
        if (boards.length === 0) {
          const resp = (await jiraService.request(
            'GET',
            `/rest/agile/1.0/board?name=${encodeURIComponent(query)}&maxResults=50`,
          )) as Record<string, unknown>;
          boards = (resp.values || []) as Array<Record<string, unknown>>;
        }

        // Strategy 3: If still nothing, fetch all and fuzzy search
        if (boards.length === 0) {
          const resp = (await jiraService.request(
            'GET',
            '/rest/agile/1.0/board?maxResults=200',
          )) as Record<string, unknown>;
          boards = (resp.values || []) as Array<Record<string, unknown>>;
        }

        // Fuzzy filter the results
        const fuse = new Fuse(boards, {
          keys: ['name'],
          threshold: 0.5,
          includeScore: true,
        });
        const results = fuse.search(query).slice(0, 5);
        // If fuzzy returned nothing but we got boards from server-side filter, show those
        const finalResults = results.length > 0
          ? results.map(r => r.item)
          : boards.slice(0, 5);
        const isExact = results.length === 0 && boards.length > 0;

        if (finalResults.length === 0) {
          lines = [`No boards matching "${query}". Try a different search term or check project key.`];
        } else {
          lines = finalResults.map(board => {
            const loc = board.location as Record<string, unknown> | undefined;
            const projKey = loc?.projectKey || loc?.projectName || 'unknown';
            return `Board #${board.id}: ${board.name} (project: ${projKey}, type: ${board.type})`;
          });
          lines.unshift(`${finalResults.length} board${isExact ? 's' : ' matches'} for "${query}":`);
        }
      }

      if (scope === 'projects') {
        const projects = (await jiraService.request(
          'GET',
          '/rest/api/2/project',
        )) as unknown as Array<Record<string, unknown>>;

        const fuse = new Fuse(projects, {
          keys: ['key', 'name'],
          threshold: 0.4,
          includeScore: true,
        });
        const results = fuse.search(query).slice(0, 5);

        if (results.length === 0) {
          lines = [`No projects matching "${query}". Try a broader search.`];
        } else {
          lines = results.map(
            r => `${r.item.key} — ${r.item.name} (match: ${Math.round((1 - (r.score || 0)) * 100)}%)`,
          );
          lines.unshift(`${results.length} matches for "${query}":`);
        }
      }

      if (scope === 'issuetypes') {
        const types = (await jiraService.request(
          'GET',
          '/rest/api/2/issuetype',
        )) as unknown as Array<Record<string, unknown>>;

        const fuse = new Fuse(types, {
          keys: ['name'],
          threshold: 0.4,
          includeScore: true,
        });
        const results = fuse.search(query).slice(0, 5);

        if (results.length === 0) {
          lines = [`No issue types matching "${query}".`];
        } else {
          lines = results.map(
            r => `${r.item.name}${r.item.subtask ? ' (sub-task)' : ''}`,
          );
          lines.unshift(`${results.length} matches:`);
        }
      }

      if (scope === 'statuses') {
        const statuses = (await jiraService.request(
          'GET',
          '/rest/api/2/status',
        )) as unknown as Array<Record<string, unknown>>;

        const fuse = new Fuse(statuses, {
          keys: ['name'],
          threshold: 0.4,
          includeScore: true,
        });
        const results = fuse.search(query).slice(0, 5);

        if (results.length === 0) {
          lines = [`No statuses matching "${query}".`];
        } else {
          lines = results.map(r => {
            const cat = (r.item.statusCategory as Record<string, unknown>)?.name || '';
            return `${r.item.name} [${cat}]`;
          });
          lines.unshift(`${results.length} matches:`);
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: lines.join('\n'),
          },
        ],
      };
    },
  );

  // ── Tool: jira_search ──────────────────────────────────────
  server.tool(
    'jira_search',
    `Search Jira issues using JQL (Jira Query Language).
Returns summarized issues with key, summary, status, assignee, priority.

IMPORTANT: JQL uses project KEYS (e.g. "MYAPP"), NOT project display names.
If you don't know the project key, call jira_discover first with scope="projects".

JQL examples:
  - "project = MYAPP ORDER BY created DESC"
  - "project = MYAPP AND status = 'In Progress'"
  - "project = MYAPP AND component = 'Backend'"
  - "assignee = currentUser() AND resolution = Unresolved"
  - "type = Bug AND priority = High AND project = MYAPP"
  - "sprint in openSprints() AND project = MYAPP"`,
    {
      jql: z.string().describe('JQL query string using project KEYS not names'),
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
  - GET /rest/api/2/issue/{key} — Get issue details (includes custom fields)
  - POST /rest/api/2/issue — Create issue
  - PUT /rest/api/2/issue/{key} — Update issue
  - GET /rest/api/2/project — List all projects
  - GET /rest/api/2/project/{key} — Project details with components
  - GET /rest/api/2/issue/{key}/transitions — Get transitions
  - GET /rest/api/2/field — List all fields (including custom)
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
  - jira_field(name) — Async, returns cached field ID by name (e.g. jira_field('Story Points') → 'customfield_10002'). Fetches once per session, instant after.
  - console.log(...args) — Captured and returned

CUSTOM FIELDS — use jira_field() for cached lookups (NO repeated API calls):
  const spId = await jira_field('Story Points');      // → 'customfield_10002'
  const epicId = await jira_field('Epic Link');        // → 'customfield_10970'
  const acId = await jira_field('Acceptance Criteria'); // → 'customfield_10777'
  const issue = await jira_api('GET', '/rest/api/2/issue/KEY');
  console.log('SP: ' + issue.fields[spId]);

BOARDS — get backlog or sprint items (use jira_discover to find board ID first):
  const backlog = await jira_api('GET', '/rest/agile/1.0/board/42/backlog');
  const sprints = await jira_api('GET', '/rest/agile/1.0/board/42/sprint');
  const active = sprints.values.find(s => s.state === 'active');

COMPONENTS:
  const proj = await jira_api('GET', '/rest/api/2/project/KEY');
  proj.components.forEach(c => console.log(c.name));

JIRA MARKUP (NOT Markdown!) — use when writing descriptions or comments:
  *bold*  _italic_  -strikethrough-  +underline+
  {code:java}code block{code}  {{inline code}}
  {noformat}preformatted{noformat}
  h1. Heading   h2. Subheading
  * bullet list   # numbered list
  [link text|http://url]   [~username] (mention)

Timeout: 30s. Memory: 128MB. Write ops require JIRA_READONLY=false.`,
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
