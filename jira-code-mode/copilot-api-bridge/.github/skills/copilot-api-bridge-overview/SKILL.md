---
name: Copilot API Bridge Overview
description: The high-level architectural documentation encompassing the problem, solution, and underlying mechanisms of the copilot-api-bridge platform.
---

## 1. The Problem
VS Code Copilot has incredible reasoning capabilities but suffers from three massive limitations when operating in enterprise environments:
1. **Blind Execution**: Copilot has no native understanding of internal proprietary microservices or databases.
2. **Security Risks**: Passing raw API tokens, JWTs, or Database credentials directly into an LLM context window is a massive security vulnerability.
3. **HTTP Overhead**: Having Copilot construct raw `fetch()` calls sequentially limits its ability to do complex, multi-step orchestration due to token limits and syntax errors.

## 2. The Solution: Copilot API Bridge
The **Copilot API Bridge** is a native, internal MCP (Model Context Protocol) server running over `stdio`. It acts as a highly secure proxy and execution environment between the LLM and your backend APIs.

### "Code Mode" Execution (The V8 Sandbox)
Instead of Copilot guessing how to make HTTP calls, we expose **Typed Facade Classes**.
Copilot generates small snippets of JavaScript using these Facades and passes the script to the bridge. 
The bridge executes the injected script inside a locked-down **V8 Isolate Sandbox** (via `isolated-vm`). 

This grants Copilot "Code Mode" execution—it can write procedural logic (loops, data sorting, API chaining) and immediately get the result back in the chat window, without ever seeing the authentication secrets.

## 3. Core Architectural Components

1. **Service Adapters (`services/{name}`)**
   Every microservice onboarded into the bridge consists of three parts:
   - `facade.ts`: A curated class wrapping the raw API/Database, equipped with connection pooling and injected auth.
   - `docs/capabilities.ts`: A concise manual fed to Copilot explaining precisely what methods are on the Facade.
   - `index.ts`: The adapter export, mapping the facade and declaring "Direct Tools" (high-speed lookup macros).

2. **The Registry (`core/registry`)**
   The central catalog where all microservice `ServiceAdapter` objects are registered and dynamically loaded into the MCP server.

3. **Tool Factory (`core/mcp/tools.ts`)**
   Automatically converts any registered ServiceAdapter into native MCP tools. For example, for a target named `jira`, it auto-generates `jira_search_docs` and `jira_execute`.

4. **The Sandbox (`core/sandbox`)**
   Handles the V8 isolation, script timeout limits (30s), memory limits (128MB), and execution logging. It also features a Policy engine to flag potentially dangerous mutating operations.

## 4. The Workflow
When developers want Copilot to interact with a new service:
1. **Generate**: Create the OpenAPI client or DB dependency.
2. **Wrap**: Write the Facade.
3. **Register**: Add the adapter to the registry.
4. **Interact**: Open Copilot Chat and instruct it to search the docs and execute logic. The bridge handles sandboxing and returning the payload seamlessly.
