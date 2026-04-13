# Project Overview

## Mission

The **Copilot API Bridge** is a reusable MCP (Model Context Protocol) server that bridges VS Code Copilot to enterprise backend services while maintaining security and enabling sophisticated multi-step operations through sandboxed code execution.

## Core Problem It Solves

Without the bridge, Copilot suffers from:
1. **Blind Execution** — No understanding of internal APIs or databases
2. **Security Risks** — Credentials cannot be safely shared with LLMs
3. **HTTP Overhead** — Sequential API calls exhaust token context

## Solution: Typed Facades + Code Mode Execution

The bridge exposes **Typed Facade Classes** that Copilot can use to generate JavaScript code. Instead of making raw HTTP calls, Copilot writes procedural logic that executes inside a locked V8 Sandbox, then returns results instantly.

### Three-Part Service Integration

Each service requires:
1. **Facade** — Curated class wrapping the API/Database with injected auth
2. **Documentation** — Capability docs explaining available methods
3. **Index** — Export mapping, direct tools, and adapter registration

## Current Services

### Active
- **Jira** — Full issue search, retrieval, and manipulation
- **Tasks** — Internal task management with filtering and stats
- **Azure SQL** — Direct database queries with schema discovery

### MCP Tools Generated

For each service, the framework automatically creates:
- `{service}_search_docs` — Semantic search of capability documentation
- `{service}_execute` — Code execution sandbox with access to facade methods
- `{service}_{tool_name}` — Direct tools for high-frequency operations (e.g., `jira_get_issue`, `tasks_list`)

## Architecture Highlights

- **Modular**: Services are loosely coupled via the registry
- **Secure**: Credentials stay in-process, never reach the LLM
- **Fast**: Direct tools bypass the sandbox for quick lookups
- **Typed**: Full TypeScript support from service to execution

## Key Files

| File | Purpose |
|------|---------|
| `mcp-server.ts` | Entry point; registers adapters and starts MCP |
| `core/registry/service-registry.ts` | Service discovery and registration |
| `core/sandbox/runner.ts` | V8 isolation and script execution |
| `core/mcp/tools. ts` | Auto-generates MCP tools from adapters |
| `services/{name}/` | Service adapter directories |

## Next Steps for Contributors

1. Read [Architecture](architecture.md) for detailed design
2. Explore [Service Adapters](service-adapters.md) to understand integration patterns
3. Follow [Onboarding Guide](onboarding.md) to add a new service
