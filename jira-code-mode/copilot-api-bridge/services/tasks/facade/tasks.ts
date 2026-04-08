/**
 * Tasks Facade — clean API for the Task Manager microservice.
 *
 * This facade wraps the auto-generated client from the OpenAPI spec.
 * Auth is injected at construction from env vars.
 *
 * This demonstrates the full pipeline:
 *   OpenAPI spec → generated client → facade → MCP tools
 */
import http from 'http';

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string | null;
}

export class TasksFacade {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = (process.env.TASKS_URL || 'http://localhost:4000').replace(/\/+$/, '');
    this.token = process.env.TASKS_TOKEN || '';
  }

  // ── Read Operations ─────────────────────────────────────────

  /**
   * Get a task by ID.
   * @param taskId - e.g. "t1"
   * @returns Full task object
   */
  async getTask(taskId: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/api/tasks/${taskId}`);
  }

  /**
   * List tasks with optional filters.
   * @param filters - Optional: { status, priority, assignee, tag }
   * @returns Array of tasks
   */
  async listTasks(filters?: Record<string, string>): Promise<Record<string, unknown>[]> {
    const query = filters
      ? '?' + Object.entries(filters).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      : '';
    const result = await this.request('GET', `/api/tasks${query}`);
    return result as unknown as Record<string, unknown>[];
  }

  /**
   * Get task statistics — total count, breakdown by status and priority.
   * @returns { total, byStatus, byPriority, unassigned }
   */
  async getStats(): Promise<Record<string, unknown>> {
    return this.request('GET', '/api/tasks/stats');
  }

  /**
   * List all users in the system.
   * @returns Array of user objects { id, name, email, role }
   */
  async listUsers(): Promise<Record<string, unknown>[]> {
    const result = await this.request('GET', '/api/users');
    return result as unknown as Record<string, unknown>[];
  }

  /**
   * Health check — verify the service is running.
   * @returns { status, service, uptime }
   */
  async healthCheck(): Promise<Record<string, unknown>> {
    return this.request('GET', '/api/health');
  }

  // ── Write Operations ────────────────────────────────────────

  /**
   * Create a new task.
   * @param title - Task title (required)
   * @param priority - "low" | "medium" | "high" | "critical" (default: "medium")
   * @param description - Task description (optional)
   * @param tags - Array of tags (optional)
   */
  async createTask(
    title: string,
    priority?: string,
    description?: string,
    tags?: string[]
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { title };
    if (priority) body.priority = priority;
    if (description) body.description = description;
    if (tags) body.tags = tags;
    return this.request('POST', '/api/tasks', body);
  }

  /**
   * Update a task's fields.
   * @param taskId - Task ID
   * @param updates - Fields to update: { title, description, status, priority, tags }
   */
  async updateTask(
    taskId: string,
    updates: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request('PUT', `/api/tasks/${taskId}`, updates);
  }

  /**
   * Move a task to a new status.
   * @param taskId - Task ID
   * @param status - "todo" | "in_progress" | "done"
   */
  async moveTask(taskId: string, status: string): Promise<Record<string, unknown>> {
    return this.request('PUT', `/api/tasks/${taskId}`, { status });
  }

  /**
   * Assign a task to a user.
   * @param taskId - Task ID
   * @param userId - User ID to assign to
   */
  async assignTask(taskId: string, userId: string): Promise<Record<string, unknown>> {
    return this.request('POST', `/api/tasks/${taskId}/assign`, { userId });
  }

  /**
   * Delete a task.
   * @param taskId - Task ID
   */
  async deleteTask(taskId: string): Promise<Record<string, unknown>> {
    return this.request('DELETE', `/api/tasks/${taskId}`);
  }

  // ── HTTP Client ─────────────────────────────────────────────

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<Record<string, unknown>> {
    const url = new URL(path, this.baseUrl);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        } as Record<string, string>,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Tasks API ${method} ${path} returned ${res.statusCode}: ${data.slice(0, 500)}`));
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
      req.setTimeout(5000, () => req.destroy(new Error('Tasks API request timed out (5s)')));

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}
