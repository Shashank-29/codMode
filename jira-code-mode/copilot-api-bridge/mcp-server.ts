/**
 * copilot-api-bridge — MCP Server Entry Point
 *
 * Registers all service adapters and starts an stdio MCP server.
 * VS Code connects to this via .vscode/mcp.json.
 *
 * To add a new service:
 *   1. Create services/{name}/ with facade, docs, and index.ts
 *   2. Import and register the adapter below
 */
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ServiceRegistry } from './core/registry/service-registry.js';
import { SandboxRunner } from './core/sandbox/runner.js';
import { registerAdapterTools } from './core/mcp/tools.js';

// ── Import Service Adapters ─────────────────────────────────
import { JiraAdapter } from './services/jira/index.js';
import { TasksAdapter } from './services/tasks/index.js';
import { AzureSqlAdapter } from './services/azure-sql/index.js';

// ── Register Adapters ───────────────────────────────────────
ServiceRegistry.register(JiraAdapter);
ServiceRegistry.register(TasksAdapter);
ServiceRegistry.register(AzureSqlAdapter);

// ── Create Shared Resources ─────────────────────────────────
const sandbox = new SandboxRunner();

// ── Create MCP Server ───────────────────────────────────────
const server = new McpServer({
  name: 'copilot-api-bridge',
  version: '0.1.0',
});

// Register tools for all adapters
for (const adapter of ServiceRegistry.list()) {
  registerAdapterTools(server, adapter, sandbox);
}

console.error(
  `[copilot-api-bridge] Starting with ${ServiceRegistry.size} service(s): ` +
    ServiceRegistry.list()
      .map((a) => a.name)
      .join(', ')
);

// ── Start stdio Transport ───────────────────────────────────
const transport = new StdioServerTransport();

await server.connect(transport);

console.error('[copilot-api-bridge] MCP server running on stdio');

// ── Graceful Shutdown ───────────────────────────────────────
process.on('SIGINT', () => {
  console.error('[copilot-api-bridge] Shutting down...');
  sandbox.dispose();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[copilot-api-bridge] Shutting down...');
  sandbox.dispose();
  process.exit(0);
});
