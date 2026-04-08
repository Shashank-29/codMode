/**
 * MCP Tool Factory — creates MCP tools from ServiceAdapters.
 *
 * For each registered adapter, creates:
 *   1. {name}_search_docs — capability discovery
 *   2. {name}_execute — sandboxed code execution against the facade
 *   3. Any adapter.directTools — dedicated tools for high-frequency ops
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ServiceAdapter } from '../registry/types.js';
import { SandboxRunner, SandboxResult } from '../sandbox/runner.js';
import { checkMutationPolicy } from '../sandbox/policy.js';

/**
 * Register all MCP tools for a service adapter on the given MCP server.
 *
 * @param server - The MCP server instance
 * @param adapter - The service adapter to create tools for
 * @param sandbox - The shared sandbox runner
 */
export function registerAdapterTools(
  server: McpServer,
  adapter: ServiceAdapter,
  sandbox: SandboxRunner
): void {
  const { name } = adapter;

  // ── Tool 1: search_docs ─────────────────────────────────────
  server.tool(
    `${name}_search_docs`,
    `Search ${adapter.description} capabilities. Returns available methods, parameters, and usage examples. Call this BEFORE writing code with ${name}_execute to discover what methods are available.`,
    {
      query: z
        .string()
        .describe('Natural language query describing what you want to do'),
    },
    async ({ query }) => {
      const allDocs = adapter.docs();

      // Simple keyword filtering — split query into words, find matching lines
      const queryWords = query.toLowerCase().split(/\s+/);
      const lines = allDocs.split('\n');

      const scored = lines.map((line) => {
        const lower = line.toLowerCase();
        const score = queryWords.filter((w) => lower.includes(w)).length;
        return { line, score };
      });

      // Return lines that match at least one query word, plus context
      const relevant = new Set<number>();
      scored.forEach((item, idx) => {
        if (item.score > 0) {
          // Include 2 lines of context above and below
          for (let i = Math.max(0, idx - 2); i <= Math.min(lines.length - 1, idx + 2); i++) {
            relevant.add(i);
          }
        }
      });

      // If nothing matches well, return full docs (they should be <1000 tokens)
      const filtered =
        relevant.size > 0
          ? Array.from(relevant)
              .sort((a, b) => a - b)
              .map((i) => lines[i])
              .join('\n')
          : allDocs;

      return {
        content: [{ type: 'text' as const, text: filtered }],
      };
    }
  );

  // ── Tool 2: execute ─────────────────────────────────────────
  server.tool(
    `${name}_execute`,
    `Execute JavaScript code against the ${adapter.description} facade.
Inside the sandbox you have access to the \`${name}\` object with typed methods.
Call ${name}_search_docs first to discover available methods.

Example:
  const issues = await ${name}.searchIssues("project = MYAPP");
  console.log(issues);

Console output is captured. The last expression or return value is returned.
Timeout: 30s. Memory: 128MB. No filesystem or network access.`,
    {
      code: z
        .string()
        .describe(`JavaScript code using the \`${name}\` facade object`),
    },
    async ({ code }) => {
      // Check mutation policy
      const policy = checkMutationPolicy(code, name);
      if (policy.hasMutations) {
        // For now, log the warning. In v2, this becomes a confirmation gate.
        console.log(
          `[Policy] Mutation detected in ${name}_execute: ${policy.detectedMethods.join(', ')}`
        );
      }

      const result: SandboxResult = await sandbox.execute(code, adapter);

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
    }
  );

  // ── Direct Tools ────────────────────────────────────────────
  if (adapter.directTools) {
    for (const tool of adapter.directTools) {
      const toolName = `${name}_${tool.name}`;

      server.tool(
        toolName,
        tool.description,
        tool.parameters,
        async (params) => {
          try {
            const result = await tool.handler(params as Record<string, unknown>);
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    typeof result === 'string'
                      ? result
                      : JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Error: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      console.log(`[Tools] Registered direct tool: ${toolName}`);
    }
  }

  const toolCount = 2 + (adapter.directTools?.length ?? 0);
  console.log(
    `[Tools] Registered ${toolCount} tools for service: ${name}`
  );
}
