/**
 * Core type definitions for the copilot-api-bridge framework.
 *
 * Every service adapter must conform to the ServiceAdapter interface.
 * The framework uses these types to auto-create MCP tools.
 */
import { z } from 'zod';

// ── Direct Tool Definition ──────────────────────────────────────

/** Schema for a single parameter in a direct tool */
export interface DirectToolParam {
  name: string;
  schema: z.ZodType;
  description: string;
}

/**
 * A direct MCP tool that bypasses code execution.
 * Use for high-frequency, simple operations (e.g., quick lookups).
 */
export interface DirectTool {
  /** Tool name — will be prefixed with service name: `{service}_{name}` */
  name: string;
  /** Description shown to the model */
  description: string;
  /** Zod schema for tool parameters */
  parameters: Record<string, z.ZodType>;
  /** Handler function — receives parsed params, returns result */
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

// ── Service Adapter ─────────────────────────────────────────────

/**
 * The contract every service must implement to be registered
 * with the copilot-api-bridge framework.
 *
 * The framework auto-creates `{name}_search_docs` and `{name}_execute`
 * tools. Additional tools come from `directTools`.
 */
export interface ServiceAdapter {
  /** Short identifier: "jira", "payments", "users" */
  name: string;

  /** Human-readable description shown when Copilot lists tools */
  description: string;

  /**
   * The facade object — all callable methods for this service.
   * These methods are injected into the V8 sandbox as `{name}.methodName()`.
   * Auth should be injected at construction; methods must never expose credentials.
   */
  facade: Record<string, (...args: unknown[]) => Promise<unknown>>;

  /**
   * Returns capability documentation for the search_docs tool.
   * Must be concise — under 1,000 tokens.
   * Lists method names, parameters, return types, and usage examples.
   */
  docs: () => string;

  /**
   * Optional direct tools for high-frequency operations.
   * Each becomes a dedicated MCP tool: `{name}_{tool.name}`.
   * Keep to 2–3 max per service.
   */
  directTools?: DirectTool[];
}
