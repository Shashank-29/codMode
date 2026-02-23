/**
 * MCP Server Module — Bridges LB4 with the MCP Streamable HTTP transport.
 *
 * Registers two MCP tools:
 *   1. get_weather  — Returns weather data for a city
 *   2. code_execution — Executes JavaScript in a V8 isolate sandbox
 *
 * Uses @modelcontextprotocol/sdk for protocol compliance:
 *   - JSON-RPC 2.0 over HTTP POST
 *   - Session management (Mcp-Session-Id)
 *   - Optional SSE streaming via GET
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {IncomingMessage, ServerResponse} from 'http';
import {z} from 'zod';
import {V8SandboxService} from './services/v8-sandbox.service';
import {WeatherService} from './services/weather.service';

// Singleton service instances
const weatherService = new WeatherService();
const sandboxService = new V8SandboxService();

/**
 * Create a fresh McpServer with tools registered.
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'cod-mode',
    version: '1.0.0',
  });

  // ── Tool: get_weather ─────────────────────────────────────
  server.tool(
    'get_weather',
    'Get current weather data for a city. Returns temperature (°C), humidity (%), and condition.',
    {
      city: z.string().describe('City name, e.g. "Bengaluru", "Delhi"'),
    },
    async ({city}) => {
      const weather = await weatherService.getWeather(city);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(weather, null, 2),
          },
        ],
      };
    },
  );

  // ── Tool: code_execution ──────────────────────────────────
  server.tool(
    'code_execution',
    `Execute JavaScript code in a secure V8 isolate sandbox.
Available inside the sandbox:
  - console.log(...args) — Captured and returned
  - get_weather(city) — Async function, returns { city, temp, humidity, condition }

The code runs with a 5s timeout and 128MB memory limit.
Use this for multi-step logic, loops, data transforms, or chaining multiple tool calls.

Example: "const w = await get_weather('Delhi'); console.log(w.temp);"`,
    {
      code: z
        .string()
        .describe(
          'JavaScript code to execute. Can use await, get_weather(), and console.log().',
        ),
    },
    async ({code}) => {
      const result = await sandboxService.execute(code);

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

// ── Session management ──────────────────────────────────────
// Map of session ID → transport (for stateful sessions)
const sessions = new Map<string, StreamableHTTPServerTransport>();

/**
 * Handle an incoming MCP request (POST /mcp).
 * Creates a new transport per session for Streamable HTTP.
 */
export async function handleMcpPost(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // If existing session, reuse transport
  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }

  // New session — create transport + server
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomSessionId(),
    onsessioninitialized: (id) => {
      sessions.set(id, transport);
      console.log(`[MCP] Session created: ${id}`);
    },
  });

  // Clean up on close
  transport.onclose = () => {
    const id = [...sessions.entries()].find(([, t]) => t === transport)?.[0];
    if (id) {
      sessions.delete(id);
      console.log(`[MCP] Session closed: ${id}`);
    }
  };

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

/**
 * Handle SSE GET requests (GET /mcp) for streaming responses.
 */
export async function handleMcpGet(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (!sessionId || !sessions.has(sessionId)) {
    res.writeHead(400, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'No valid session. Send initialize first.'}));
    return;
  }

  const transport = sessions.get(sessionId)!;
  await transport.handleRequest(req, res);
}

/**
 * Handle DELETE requests (DELETE /mcp) for session termination.
 */
export async function handleMcpDelete(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId)!;
    await transport.close();
    sessions.delete(sessionId);
    res.writeHead(200);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end();
}

/**
 * Generate a random session ID.
 */
function randomSessionId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Gracefully shut down the sandbox pool.
 */
export function disposeSandbox(): void {
  sandboxService.dispose();
}
