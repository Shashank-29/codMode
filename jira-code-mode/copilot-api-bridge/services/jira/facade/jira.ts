/**
 * Jira Facade — clean, typed API for Jira operations.
 *
 * This is the org's Jira API: clean method names, auth hidden,
 * business logic encoded, error messages human-readable.
 *
 * Auth: PAT injected at construction from env vars.
 * The sandbox and model never see credentials.
 */
import http from 'http';
import https from 'https';

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  priority: string;
  issuetype: string;
  created: string;
  updated: string;
  duedate: string | null;
}

export class JiraFacade {
  private baseUrl: string;
  private pat: string;
  private readonly: boolean;
  private fieldCache: Map<string, string> = new Map();
  private fieldCacheLoaded = false;

  constructor() {
    this.baseUrl = (process.env.JIRA_URL || '').replace(/\/+$/, '');
    this.pat = process.env.JIRA_PAT || '';
    this.readonly = process.env.JIRA_READONLY !== 'false';

    if (!this.baseUrl) {
      console.warn('[JiraFacade] JIRA_URL not set — Jira calls will fail');
    }
    if (!this.pat) {
      console.warn('[JiraFacade] JIRA_PAT not set — Jira calls will fail');
    }
  }

  // ── Read Operations ─────────────────────────────────────────

  /**
   * Get full issue details by key.
   * @param issueKey - e.g. "PROJ-123"
   * @returns Issue object with all fields
   */
  async getIssue(issueKey: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/rest/api/2/issue/${issueKey}`);
  }

  /**
   * Search issues using JQL.
   * @param jql - JQL query string (e.g. "project = MYAPP AND status = 'In Progress'")
   * @param maxResults - Max results to return (default: 50)
   * @returns Array of summarized issues
   */
  async searchIssues(jql: string, maxResults = 50): Promise<JiraIssue[]> {
    const body = {
      jql,
      startAt: 0,
      maxResults,
      fields: [
        'summary', 'status', 'assignee', 'priority',
        'issuetype', 'created', 'updated', 'duedate',
      ],
    };

    const response = (await this.request('POST', '/rest/api/2/search', body)) as Record<string, unknown>;
    const issuesList = (response.issues || []) as Record<string, unknown>[];
    return issuesList.map((issue) => this.summarizeIssue(issue));
  }

  /**
   * Get issues blocking the given user (or current user).
   * @param assignee - Jira username (optional, defaults to currentUser())
   * @returns Array of blocked/blocker issues
   */
  async getMyBlockers(assignee?: string): Promise<JiraIssue[]> {
    const who = assignee || 'currentUser()';
    const jql = `assignee = ${who} AND status = "Blocked" ORDER BY priority DESC`;
    return this.searchIssues(jql);
  }

  /**
   * Get sprint summary for a board — aggregated health metrics.
   * @param boardId - Agile board ID
   * @returns Sprint summary object
   */
  async getSprintSummary(boardId: number): Promise<Record<string, unknown>> {
    // Get active sprint
    const sprintsResp = (await this.request(
      'GET',
      `/rest/agile/1.0/board/${boardId}/sprint?state=active`
    )) as Record<string, unknown>;

    const sprints = (sprintsResp.values || []) as Record<string, unknown>[];
    if (sprints.length === 0) {
      return { error: `No active sprint found for board ${boardId}` };
    }

    const sprint = sprints[0];
    const sprintId = sprint.id;

    // Get sprint issues
    const issuesResp = (await this.request(
      'GET',
      `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=200`
    )) as Record<string, unknown>;

    const issues = (issuesResp.issues || []) as Record<string, unknown>[];

    // Aggregate
    const statusCounts: Record<string, number> = {};
    for (const issue of issues) {
      const fields = (issue.fields || {}) as Record<string, unknown>;
      const status = ((fields.status || {}) as Record<string, unknown>).name as string || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    return {
      sprint: sprint.name,
      sprintId,
      totalIssues: issues.length,
      statusBreakdown: statusCounts,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
    };
  }

  /**
   * Resolve a custom field name to its ID.
   * e.g. "Story Points" → "customfield_10032"
   * @param fieldName - Human-readable field name
   */
  async getFieldId(fieldName: string): Promise<string | null> {
    const key = fieldName.toLowerCase();
    if (this.fieldCache.has(key)) {
      return this.fieldCache.get(key)!;
    }

    if (!this.fieldCacheLoaded) {
      const fields = (await this.request('GET', '/rest/api/2/field')) as unknown as Array<Record<string, unknown>>;
      for (const f of fields) {
        const name = ((f.name as string) || '').toLowerCase();
        const id = f.id as string;
        if (name && id) this.fieldCache.set(name, id);
      }
      this.fieldCacheLoaded = true;
    }

    return this.fieldCache.get(key) || null;
  }

  // ── Write Operations ────────────────────────────────────────

  /**
   * Move an issue to a new status by name.
   * Resolves the human-readable status name to the correct transition ID.
   * @param issueKey - e.g. "PROJ-123"
   * @param statusName - e.g. "In Progress", "Done"
   */
  async moveIssueToStatus(issueKey: string, statusName: string): Promise<Record<string, unknown>> {
    this.checkWriteAccess();

    // Get available transitions
    const resp = (await this.request(
      'GET',
      `/rest/api/2/issue/${issueKey}/transitions`
    )) as Record<string, unknown>;

    const transitions = (resp.transitions || []) as Array<Record<string, unknown>>;
    const match = transitions.find(
      (t) => (t.name as string).toLowerCase() === statusName.toLowerCase()
    );

    if (!match) {
      const available = transitions.map((t) => t.name).join(', ');
      throw new Error(
        `Cannot transition "${issueKey}" to "${statusName}". Available transitions: ${available}`
      );
    }

    await this.request('POST', `/rest/api/2/issue/${issueKey}/transitions`, {
      transition: { id: match.id },
    });

    return { success: true, issueKey, newStatus: statusName };
  }

  /**
   * Add a comment to an issue.
   * @param issueKey - e.g. "PROJ-123"
   * @param text - Comment body (uses Jira markup, not Markdown)
   */
  async addComment(issueKey: string, text: string): Promise<Record<string, unknown>> {
    this.checkWriteAccess();
    const result = await this.request('POST', `/rest/api/2/issue/${issueKey}/comment`, {
      body: text,
    });
    return result;
  }

  /**
   * Create a new issue.
   * @param project - Project key (e.g. "MYAPP")
   * @param issueType - e.g. "Bug", "Story", "Task"
   * @param summary - Issue title
   * @param description - Issue description (optional)
   */
  async createIssue(
    project: string,
    issueType: string,
    summary: string,
    description?: string
  ): Promise<Record<string, unknown>> {
    this.checkWriteAccess();
    const fields: Record<string, unknown> = {
      project: { key: project },
      issuetype: { name: issueType },
      summary,
    };
    if (description) {
      fields.description = description;
    }
    return this.request('POST', '/rest/api/2/issue', { fields });
  }

  /**
   * Assign an issue to a user.
   * @param issueKey - e.g. "PROJ-123"
   * @param username - Jira username to assign to
   */
  async assignIssue(issueKey: string, username: string): Promise<Record<string, unknown>> {
    this.checkWriteAccess();
    await this.request('PUT', `/rest/api/2/issue/${issueKey}/assignee`, {
      name: username,
    });
    return { success: true, issueKey, assignedTo: username };
  }

  // ── Discovery ───────────────────────────────────────────────

  /**
   * Fuzzy-search Jira entities (boards, projects, issue types, statuses).
   * Handles typos and partial matches.
   * @param scope - What to search: "boards", "projects", "issuetypes", "statuses"
   * @param query - Search term
   */
  async discoverEntities(
    scope: string,
    query: string
  ): Promise<string[]> {
    const Fuse = (await import('fuse.js')).default;

    if (scope === 'boards') {
      let boards: Array<Record<string, unknown>> = [];

      // Try project key filter first
      const isProjectKey = /^[A-Z][A-Z0-9_]+$/.test(query);
      if (isProjectKey) {
        try {
          const resp = (await this.request(
            'GET',
            `/rest/agile/1.0/board?projectKeyOrId=${query}&maxResults=50`
          )) as Record<string, unknown>;
          boards = (resp.values || []) as Array<Record<string, unknown>>;
        } catch { /* fall through */ }
      }

      if (boards.length === 0) {
        const resp = (await this.request(
          'GET',
          `/rest/agile/1.0/board?name=${encodeURIComponent(query)}&maxResults=50`
        )) as Record<string, unknown>;
        boards = (resp.values || []) as Array<Record<string, unknown>>;
      }

      if (boards.length === 0) {
        const resp = (await this.request('GET', '/rest/agile/1.0/board?maxResults=200')) as Record<string, unknown>;
        boards = (resp.values || []) as Array<Record<string, unknown>>;
      }

      const fuse = new Fuse(boards, { keys: ['name'], threshold: 0.5, includeScore: true });
      const results = fuse.search(query).slice(0, 5);
      const finalResults = results.length > 0 ? results.map((r) => r.item) : boards.slice(0, 5);

      return finalResults.map((board) => {
        const loc = board.location as Record<string, unknown> | undefined;
        const projKey = loc?.projectKey || loc?.projectName || 'unknown';
        return `Board #${board.id}: ${board.name} (project: ${projKey}, type: ${board.type})`;
      });
    }

    if (scope === 'projects') {
      const projects = (await this.request('GET', '/rest/api/2/project')) as unknown as Array<Record<string, unknown>>;
      const fuse = new Fuse(projects, { keys: ['key', 'name'], threshold: 0.4, includeScore: true });
      const results = fuse.search(query).slice(0, 5);
      return results.map((r) => `${r.item.key} — ${r.item.name}`);
    }

    if (scope === 'issuetypes') {
      const types = (await this.request('GET', '/rest/api/2/issuetype')) as unknown as Array<Record<string, unknown>>;
      const fuse = new Fuse(types, { keys: ['name'], threshold: 0.4, includeScore: true });
      const results = fuse.search(query).slice(0, 5);
      return results.map((r) => `${r.item.name}${r.item.subtask ? ' (sub-task)' : ''}`);
    }

    if (scope === 'statuses') {
      const statuses = (await this.request('GET', '/rest/api/2/status')) as unknown as Array<Record<string, unknown>>;
      const fuse = new Fuse(statuses, { keys: ['name'], threshold: 0.4, includeScore: true });
      const results = fuse.search(query).slice(0, 5);
      return results.map((r) => {
        const cat = (r.item.statusCategory as Record<string, unknown>)?.name || '';
        return `${r.item.name} [${cat}]`;
      });
    }

    return [`Unknown scope "${scope}". Use: boards, projects, issuetypes, statuses`];
  }

  // ── Low-level HTTP ──────────────────────────────────────────

  /**
   * Make a direct REST call to Jira.
   * @internal — prefer facade methods above.
   */
  async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Record<string, unknown>> {
    if (
      ['POST', 'PUT', 'DELETE'].includes(method.toUpperCase()) &&
      path !== '/rest/api/2/search'
    ) {
      this.checkWriteAccess();
    }

    const fullPath = path.startsWith('/rest/') ? path : `/rest/api/2${path}`;
    const url = new URL(fullPath, this.baseUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${this.pat}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        } as Record<string, string>,
      };

      const req = transport.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `Jira API ${method} ${fullPath} returned ${res.statusCode}: ${data.slice(0, 500)}`
              )
            );
            return;
          }
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve({ raw: data });
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10_000, () => {
        req.destroy(new Error('Jira API request timed out (10s)'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  private summarizeIssue(issue: Record<string, unknown>): JiraIssue {
    const fields = (issue.fields as Record<string, unknown>) || {};
    const status = (fields.status as Record<string, unknown>) || {};
    const assignee = fields.assignee as Record<string, unknown> | null;
    const priority = (fields.priority as Record<string, unknown>) || {};
    const issuetype = (fields.issuetype as Record<string, unknown>) || {};

    return {
      key: issue.key as string,
      summary: (fields.summary as string) || '',
      status: (status.name as string) || '',
      assignee: assignee ? (assignee.displayName as string) : null,
      priority: (priority.name as string) || '',
      issuetype: (issuetype.name as string) || '',
      created: (fields.created as string) || '',
      updated: (fields.updated as string) || '',
      duedate: (fields.duedate as string) || null,
    };
  }

  private checkWriteAccess(): void {
    if (this.readonly) {
      throw new Error(
        'Jira is in READONLY mode. Set JIRA_READONLY=false in .env to enable writes.'
      );
    }
  }
}
