---
name: Onboard Microservice Workflow
description: The exact step-by-step implementation guide for scaffolding a new Service Adapter into the bridge.
---

## Platform Architecture Context
The `copilot-api-bridge` is an internally built MCP (Model Context Protocol) server running over `stdio`. It connects VS Code Copilot to multiple backend microservices safely.
- **Code Mode Execution**: Complex operations run inside an isolated V8 Sandbox. The facade methods are exposed to this sandbox.
- **Service Adapters**: Each microservice must have a Typed Facade, LLM Capability Docs, and an Integration Index exporting it.
- **Security**: Credentials are NEVER exposed to the LLM or the V8 sandbox. They are injected at the facade layer.

## Phase 1: Setup and Generation
1. **Gather API Spec**: Obtain the `openapi3.json` or WADL file for the new microservice. You can place it in the `references/` folder of this skill.
2. **Generate Types**: Run `npx swagger-typescript-api -p new-spec.json -o ./services/{name}/generated -n api.ts` to auto-generate the strictly typed HTTP client.
3. **Environment Setup**: Add the required base URLs and Auth Tokens to `.env.example` and the developer's local `.env`.

## Phase 2: Facade Creation (Delegate to Generator)
1. Instruct the user to use the `facade-generator.agent.md` to build the core adapter files:
   - `services/{name}/facade/{name}.ts` (The Facade)
   - `services/{name}/docs/capabilities.ts` (LLM Context)
   - `services/{name}/index.ts` (Export + Direct Tools)

## Phase 3: Registration
1. Open `mcp-server.ts`.
2. Add the import: `import { NewServiceAdapter } from './services/{name}/index.js';`
3. Register it: `ServiceRegistry.register(NewServiceAdapter);`

## Phase 4: Verification
1. Run `npm run build` or `npm run typecheck` to ensure no TypeScript compilation errors exist.
2. Restart the VS Code window (`Developer: Reload Window`) to reboot the Extension Host MCP connection.
3. Validate in Copilot Chat by asking it to use `{name}_search_docs`.

*Note: If onboarding a raw Database instead of a REST API, skip Phase 1 API generation and instead install the relevant DB package (like `mssql` or `pg`).*
