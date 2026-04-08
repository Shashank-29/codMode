/**
 * Tasks Service Adapter — registers the Task Manager as a service.
 *
 * Direct tools: tasks_get_task, tasks_list, tasks_stats
 */
import { z } from 'zod';
import { ServiceAdapter, DirectTool } from '../../core/registry/types.js';
import { TasksFacade } from './facade/tasks.js';
import { tasksDocs } from './docs/capabilities.js';

const facade = new TasksFacade();

// ── Direct Tools ──────────────────────────────────────────────

const getTaskTool: DirectTool = {
  name: 'get_task',
  description: 'Get full details of a task by its ID.',
  parameters: {
    taskId: z.string().describe('Task ID, e.g. "t1"'),
  },
  handler: async (params) => {
    return facade.getTask(params.taskId as string);
  },
};

const listTool: DirectTool = {
  name: 'list',
  description: `List tasks with optional filters.
Filters: status (todo|in_progress|done), priority (low|medium|high|critical), assignee (user ID), tag.
Example: { "status": "in_progress" } or {} for all tasks.`,
  parameters: {
    status: z.enum(['todo', 'in_progress', 'done']).optional().describe('Filter by status'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
    assignee: z.string().optional().describe('Filter by assignee user ID'),
    tag: z.string().optional().describe('Filter by tag'),
  },
  handler: async (params) => {
    const filters: Record<string, string> = {};
    if (params.status) filters.status = params.status as string;
    if (params.priority) filters.priority = params.priority as string;
    if (params.assignee) filters.assignee = params.assignee as string;
    if (params.tag) filters.tag = params.tag as string;
    return facade.listTasks(Object.keys(filters).length > 0 ? filters : undefined);
  },
};

const statsTool: DirectTool = {
  name: 'stats',
  description: 'Get task statistics — total count, breakdown by status and priority, unassigned count.',
  parameters: {},
  handler: async () => {
    return facade.getStats();
  },
};

// ── Adapter Export ─────────────────────────────────────────────

function buildFacadeMethods(): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return {
    getTask: (id: unknown) => facade.getTask(id as string),
    listTasks: (filters?: unknown) => facade.listTasks(filters as Record<string, string> | undefined),
    getStats: () => facade.getStats(),
    listUsers: () => facade.listUsers(),
    healthCheck: () => facade.healthCheck(),
    createTask: (title: unknown, priority?: unknown, desc?: unknown, tags?: unknown) =>
      facade.createTask(title as string, priority as string | undefined, desc as string | undefined, tags as string[] | undefined),
    updateTask: (id: unknown, updates: unknown) =>
      facade.updateTask(id as string, updates as Record<string, unknown>),
    moveTask: (id: unknown, status: unknown) => facade.moveTask(id as string, status as string),
    assignTask: (id: unknown, userId: unknown) => facade.assignTask(id as string, userId as string),
    deleteTask: (id: unknown) => facade.deleteTask(id as string),
  };
}

export const TasksAdapter: ServiceAdapter = {
  name: 'tasks',
  description: 'Task Manager — create, list, update, assign, and track tasks',
  facade: buildFacadeMethods(),
  docs: tasksDocs,
  directTools: [getTaskTool, listTool, statsTool],
};
