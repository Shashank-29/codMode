/**
 * JiraService — REST API client for Jira Server 8.20.1
 *
 * Auth: Personal Access Token (PAT) via Bearer header.
 * Base URL from .env (JIRA_URL).
 * Write protection via JIRA_READONLY env var.
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

export class JiraService {
  private baseUrl: string;
  private pat: string;
  private readonly: boolean;
  // Per-session field mapping cache: field name → field ID
  private fieldCache: Map<string, string> = new Map();
  private fieldCacheLoaded = false;

  constructor(baseUrl: string, pat: string) {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.pat = pat;
    this.readonly = process.env.JIRA_READONLY !== 'false';
    console.log(
      `[JiraService] Configured for ${this.baseUrl} (readonly: ${this.readonly})`,
    );
  }

  /**
   * Get a custom field ID by name. Uses cache — only calls API once per session.
   * Returns the field ID (e.g. "customfield_10777") or null if not found.
   */
  async getFieldId(fieldName: string): Promise<string | null> {
    // Check cache first (case-insensitive)
    const key = fieldName.toLowerCase();
    if (this.fieldCache.has(key)) {
      return this.fieldCache.get(key)!;
    }

    // Load all fields once
    if (!this.fieldCacheLoaded) {
      await this.discoverFields();
    }

    return this.fieldCache.get(key) || null;
  }

  /**
   * Return all cached field mappings as { name → id }.
   */
  getFieldMappings(): Record<string, string> {
    const mappings: Record<string, string> = {};
    this.fieldCache.forEach((id, name) => {
      mappings[name] = id;
    });
    return mappings;
  }

  /**
   * Discover and cache all fields from Jira. Called once per session.
   */
  async discoverFields(): Promise<void> {
    if (this.fieldCacheLoaded) return;
    try {
      const fields = (await this.request(
        'GET',
        '/rest/api/2/field',
      )) as unknown as Array<Record<string, unknown>>;

      for (const f of fields) {
        const name = (f.name as string || '').toLowerCase();
        const id = f.id as string;
        if (name && id) {
          this.fieldCache.set(name, id);
        }
      }
      this.fieldCacheLoaded = true;
      console.log(`[JiraService] Cached ${this.fieldCache.size} field mappings`);
    } catch (err) {
      console.error('[JiraService] Failed to discover fields:', err);
    }
  }

  /**
   * Search issues via JQL.
   */
  async search(
    jql: string,
    fields?: string[],
    maxResults = 50,
  ): Promise<JiraIssue[]> {
    const body = {
      jql,
      startAt: 0,
      maxResults,
      fields: fields || [
        'summary',
        'status',
        'assignee',
        'priority',
        'issuetype',
        'created',
        'updated',
        'duedate',
      ],
    };

    const response = await this.request('POST', '/rest/api/2/search', body) as Record<string, unknown>;
    const issuesList = (response.issues || []) as Record<string, unknown>[];
    const issues = issuesList.map(
      (issue: Record<string, unknown>) => this.summarizeIssue(issue),
    );
    return issues;
  }

  /**
   * Get a single issue by key.
   */
  async getIssue(key: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/rest/api/2/issue/${key}`);
  }

  /**
   * Create an issue.
   */
  async createIssue(
    fields: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.checkWriteAccess();
    return this.request('POST', '/rest/api/2/issue', {fields});
  }

  /**
   * Add a comment to an issue.
   */
  async addComment(issueKey: string, body: string): Promise<unknown> {
    this.checkWriteAccess();
    return this.request('POST', `/rest/api/2/issue/${issueKey}/comment`, {
      body,
    });
  }

  /**
   * Transition an issue (change status).
   */
  async transition(
    issueKey: string,
    transitionId: string,
  ): Promise<unknown> {
    this.checkWriteAccess();
    return this.request('POST', `/rest/api/2/issue/${issueKey}/transitions`, {
      transition: {id: transitionId},
    });
  }

  /**
   * Get available transitions for an issue.
   */
  async getTransitions(
    issueKey: string,
  ): Promise<Record<string, unknown>> {
    return this.request(
      'GET',
      `/rest/api/2/issue/${issueKey}/transitions`,
    );
  }

  /**
   * Get server info (useful for connectivity test).
   */
  async getServerInfo(): Promise<Record<string, unknown>> {
    return this.request('GET', '/rest/api/2/serverInfo');
  }

  /**
   * Generic REST request to Jira.
   */
  async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    // Check write access for mutating methods
    if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase()) && path !== '/rest/api/2/search') {
      this.checkWriteAccess();
    }

    // Ensure path starts with /rest/
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

      const req = transport.request(options, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(
                `Jira API ${method} ${fullPath} returned ${res.statusCode}: ${data.slice(0, 500)}`,
              ),
            );
            return;
          }
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve({raw: data});
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error('Jira API request timed out (10s)'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Summarize a Jira issue into a compact object.
   */
  private summarizeIssue(issue: Record<string, unknown>): JiraIssue {
    const fields = issue.fields as Record<string, unknown> || {};
    const status = fields.status as Record<string, unknown> || {};
    const assignee = fields.assignee as Record<string, unknown> | null;
    const priority = fields.priority as Record<string, unknown> || {};
    const issuetype = fields.issuetype as Record<string, unknown> || {};

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
        'Jira is in READONLY mode. Set JIRA_READONLY=false in .env to enable writes.',
      );
    }
  }
}
