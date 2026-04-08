/**
 * Task Manager Microservice
 *
 * A simple CRUD service with in-memory storage.
 * Endpoints:
 *   GET    /api/tasks          — List all tasks (with optional status filter)
 *   GET    /api/tasks/:id      — Get a task by ID
 *   POST   /api/tasks          — Create a task
 *   PUT    /api/tasks/:id      — Update a task
 *   DELETE /api/tasks/:id      — Delete a task
 *   GET    /api/tasks/stats    — Get task statistics
 *   POST   /api/tasks/:id/assign — Assign a task to a user
 *   GET    /api/users          — List all users
 *   GET    /api/health         — Health check
 */
import express from 'express';

const app = express();
app.use(express.json());

// ── In-Memory Data ──────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignee: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: 'developer' | 'manager' | 'qa';
}

let taskIdCounter = 5;

const users: User[] = [
  { id: 'u1', name: 'Alice Chen', email: 'alice@example.com', role: 'developer' },
  { id: 'u2', name: 'Bob Smith', email: 'bob@example.com', role: 'manager' },
  { id: 'u3', name: 'Carol Jones', email: 'carol@example.com', role: 'qa' },
  { id: 'u4', name: 'Dan Brown', email: 'dan@example.com', role: 'developer' },
];

const tasks: Task[] = [
  {
    id: 't1', title: 'Setup CI/CD pipeline', description: 'Configure GitHub Actions for automated testing and deployment',
    status: 'in_progress', priority: 'high', assignee: 'u1', tags: ['devops', 'infra'],
    createdAt: '2026-04-01T10:00:00Z', updatedAt: '2026-04-05T14:30:00Z',
  },
  {
    id: 't2', title: 'Write API documentation', description: 'Document all REST endpoints with examples',
    status: 'todo', priority: 'medium', assignee: 'u2', tags: ['docs'],
    createdAt: '2026-04-02T11:00:00Z', updatedAt: '2026-04-02T11:00:00Z',
  },
  {
    id: 't3', title: 'Fix login page crash on Safari', description: 'Users report blank screen after OAuth redirect',
    status: 'todo', priority: 'critical', assignee: null, tags: ['bug', 'frontend'],
    createdAt: '2026-04-03T09:00:00Z', updatedAt: '2026-04-03T09:00:00Z',
  },
  {
    id: 't4', title: 'Add unit tests for payment module', description: 'Cover edge cases for refund and partial payment flows',
    status: 'done', priority: 'high', assignee: 'u3', tags: ['testing', 'payments'],
    createdAt: '2026-03-28T08:00:00Z', updatedAt: '2026-04-04T16:00:00Z',
  },
  {
    id: 't5', title: 'Database migration for user preferences', description: 'Add new columns for theme and notification settings',
    status: 'in_progress', priority: 'medium', assignee: 'u4', tags: ['backend', 'database'],
    createdAt: '2026-04-04T13:00:00Z', updatedAt: '2026-04-06T10:00:00Z',
  },
];

// ── Routes ──────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'task-manager', uptime: process.uptime() });
});

// List users
app.get('/api/users', (_req, res) => {
  res.json(users);
});

// Get task stats
app.get('/api/tasks/stats', (_req, res) => {
  const stats = {
    total: tasks.length,
    byStatus: { todo: 0, in_progress: 0, done: 0 },
    byPriority: { low: 0, medium: 0, high: 0, critical: 0 },
    unassigned: tasks.filter(t => !t.assignee).length,
  };
  for (const task of tasks) {
    stats.byStatus[task.status]++;
    stats.byPriority[task.priority]++;
  }
  res.json(stats);
});

// List tasks (with optional filters)
app.get('/api/tasks', (req, res) => {
  let result = [...tasks];
  if (req.query.status) result = result.filter(t => t.status === req.query.status);
  if (req.query.priority) result = result.filter(t => t.priority === req.query.priority);
  if (req.query.assignee) result = result.filter(t => t.assignee === req.query.assignee);
  if (req.query.tag) result = result.filter(t => t.tags.includes(req.query.tag as string));
  res.json(result);
});

// Get task by ID
app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: `Task ${req.params.id} not found` });
  res.json(task);
});

// Create task
app.post('/api/tasks', (req, res) => {
  const { title, description, priority, tags, assignee } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const task: Task = {
    id: `t${++taskIdCounter}`,
    title,
    description: description || '',
    status: 'todo',
    priority: priority || 'medium',
    assignee: assignee || null,
    tags: tags || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tasks.push(task);
  res.status(201).json(task);
});

// Update task
app.put('/api/tasks/:id', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: `Task ${req.params.id} not found` });

  const { title, description, status, priority, tags } = req.body;
  if (title) task.title = title;
  if (description !== undefined) task.description = description;
  if (status) task.status = status;
  if (priority) task.priority = priority;
  if (tags) task.tags = tags;
  task.updatedAt = new Date().toISOString();

  res.json(task);
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: `Task ${req.params.id} not found` });
  const deleted = tasks.splice(idx, 1)[0];
  res.json({ deleted: deleted.id });
});

// Assign task
app.post('/api/tasks/:id/assign', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: `Task ${req.params.id} not found` });

  const { userId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(400).json({ error: `User ${userId} not found` });

  task.assignee = userId;
  task.updatedAt = new Date().toISOString();
  res.json({ ...task, assigneeName: user.name });
});

// ── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[task-manager] Running at http://localhost:${PORT}`);
  console.log(`[task-manager] Endpoints: /api/tasks, /api/users, /api/health, /api/tasks/stats`);
});
