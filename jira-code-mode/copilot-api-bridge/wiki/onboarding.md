# Onboarding Guide: Adding a New Service

Step-by-step instructions to integrate a new backend service into the copilot-api-bridge.

## Overview

Every service requires **four phases**:

1. **Setup and Generation** — Gather API specs, generate types
2. **Facade Creation** — Build the service wrapper
3. **Registration** — Wire service into the bridge
4. **Verification** — Test and validate

Each phase takes 15-60 minutes depending on service complexity.

## Phase 1: Setup and Generation

### Step 1.1: Gather API Specification

Obtain the official API spec for your service:

**For REST APIs**:
- OpenAPI 3.0 spec (`.json` or `.yaml`)
- WADL or Swagger specification
- Store in `services/{name}/spec/openapi3.json`

**For Databases**:
- Skip this step; install driver directly

**For GraphQL**:
- Introspection schema (`.json`)
- Will need custom client (not auto-generated)

### Step 1.2: Generate Typed Client

For REST APIs, auto-generate types:

```bash
# Install generator if not already installed
npm install -g swagger-typescript-api

# Generate client code
npx swagger-typescript-api \
  -p services/{name}/spec/openapi3.json \
  -o services/{name}/generated \
  -n api.ts
```

**Output**: `services/{name}/generated/api.ts` containing:
- Request/response types
- API client class
- Full TypeScript type safety

**For Databases**: Instead, install the driver:

```bash
npm install pg       # PostgreSQL
npm install mysql    # MySQL
npm install mongodb  # MongoDB
npm install redis    # Redis
```

### Step 1.3: Environment Configuration

Add required credentials to `.env` and `.env.example`:

**Example (REST API with OAuth)**:
```env
# .env.example
MYSERVICE_BASE_URL=https://api.example.com
MYSERVICE_API_KEY=xxxx_xxxx_xxxx

# .env (never commit this, local only)
MYSERVICE_BASE_URL=https://api.example.com
MYSERVICE_API_KEY=your_actual_key_here
```

**Example (Database)**:
```env
POSTGRES_CONNECTION_STRING=postgresql://user:password@host:5432/dbname
```

## Phase 2: Facade Creation

The facade is the core of the service adapter. It wraps the raw API/database with a clean, typed interface.

### Step 2.1: Create Directory Structure

```bash
mkdir -p services/{name}/facade
mkdir -p services/{name}/docs
```

### Step 2.2: Write the Facade (`services/{name}/facade/{name}.ts`)

```typescript
// services/myservice/facade/myservice.ts
import { MyServiceApi } from '../generated/api.js';

/**
 * MyService Facade — curated interface to MyService API
 * 
 * All methods are async and return JSON-serializable results.
 * Authentication is handled internally; never exposed to user code.
 */
export class MyServiceFacade {
  private client: MyServiceApi;

  constructor() {
    // Initialize client with credentials from environment
    this.client = new MyServiceApi({
      baseURL: process.env.MYSERVICE_BASE_URL,
      headers: {
        'Authorization': `Bearer ${process.env.MYSERVICE_API_KEY}`,
      },
    });
  }

  /**
   * Get a resource by ID.
   * @param id Resource ID, e.g., "res-123"
   * @returns Complete resource object
   */
  async getResource(id: string) {
    try {
      const response = await this.client.getResource({ id });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get resource: ${error.message}`);
    }
  }

  /**
   * Search resources using query parameters.
   * @param query Search term
   * @param limit Max results (default: 50)
   * @returns Array of matching resources
   */
  async search(query: string, limit?: number) {
    const response = await this.client.search({
      q: query,
      limit: limit || 50,
    });
    return response.data.results || [];
  }

  /**
   * Get metadata and available operations.
   */
  async discover() {
    return {
      name: 'MyService',
      endpoints: [
        { method: 'getResource', description: 'Get resource by ID' },
        { method: 'search', description: 'Search resources' },
      ],
      capabilities: ['read', 'search'],
    };
  }
}
```

**Best Practices**:

✅ **Do**:
- Use descriptive method names (`getResource`, not `get`)
- Return complete data (let Copilot filter)
- Add JSDoc comments for all method}
- Include error handling and meaningful messages
- Make all methods async even if not network calls

❌ **Don't**:
- Expose credentials in method signatures
- Return raw HTTP responses
- Silence errors or return null
- Use confusing parameter names

### Step 2.3: Write Documentation (`services/{name}/docs/capabilities.ts`)

```typescript
// services/myservice/docs/capabilities.ts

/**
 * MyService capability documentation for Copilot.
 * 
 * This documentation is:
 * - Indexed by jira_search_docs tool for semantic search
 * - Displayed to Copilot to explain available methods
 * - Used to generate capability hints in chat
 */
export const myserviceDocs = {
  name: 'MyService Integration',
  description: 'Access to MyService for resource management and search',
  
  methods: [
    {
      name: 'getResource',
      description: 'Retrieve a single resource by ID. Returns complete resource object with all fields.',
      parameters: [
        {
          name: 'id',
          type: 'string',
          description: 'Resource ID, e.g. "res-123"',
        }
      ],
      returns: 'Resource object with { id, name, description, created_at, ... }',
      example: 'getResource("res-456")',
    },
    {
      name: 'search',
      description: 'Search for resources matching a query term. Supports partial matches.',
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Search term, e.g. "python"',
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Max results to return (default: 50, max: 100)',
          optional: true,
        }
      ],
      returns: 'Array of matching resource objects',
      example: 'search("backend", 10)',
    },
    {
      name: 'discover',
      description: 'Get metadata about available methods and capabilities.',
      parameters: [],
      returns: 'Metadata object with available methods and capabilities',
      example: 'discover()',
    }
  ],

  constraints: [
    'Rate limit: 1000 requests per hour',
    'Search results limited to first 100 matches',
    'Response timeout: 30 seconds',
  ],

  commonPatterns: [
    {
      description: 'Find recent resources',
      code: "await search('created:>2024-01-01', 50)"
    },
    {
      description: 'Get resource details',
      code: "await getResource('res-123')"
    },
  ],
};
```

**Structure**:
- `name` — Short name for the service
- `description` — What it does
- `methods` — Array describing each facade method
- `constraints` — Rate limits, timeouts, data limits
- `commonPatterns` — Example invocations (optional)

### Step 2.4: Create Adapter Export (`services/{name}/index.ts`)

```typescript
// services/myservice/index.ts
import { z } from 'zod';
import { ServiceAdapter, DirectTool } from '../../core/registry/types.js';
import { MyServiceFacade } from './facade/myservice.js';
import { myserviceDocs } from './docs/capabilities.js';

// ── Instantiate Facade ──────────────────────────────────────

const facade = new MyServiceFacade();

// ── Define Direct Tools (optional) ──────────────────────────

/**
 * Direct tool for fast resource lookups.
 * Bypasses sandbox for sub-100ms response times.
 */
const getResourceTool: DirectTool = {
  name: 'get_resource',
  description:
    'Quickly get a resource by ID. Returns full resource object.',
  parameters: {
    id: z
      .string()
      .describe('Resource ID, e.g., "res-123"'),
  },
  handler: async (params) => {
    return facade.getResource(params.id as string);
  },
};

/**
 * Direct tool for searching.
 */
const searchTool: DirectTool = {
  name: 'search',
  description: 'Search resources by query term.',
  parameters: {
    query: z
      .string()
      .describe('Search query'),
    limit: z
      .number()
      .optional()
      .describe('Max results (default: 50)'),
  },
  handler: async (params) => {
    return facade.search(
      params.query as string,
      params.limit as number | undefined
    );
  },
};

// ── Expose Service Adapter ──────────────────────────────────

export const MyServiceAdapter: ServiceAdapter = {
  name: 'myservice',
  description: 'MyService integration for resource management',
  facade: {
    getResource: facade.getResource.bind(facade),
    search: facade.search.bind(facade),
    discover: facade.discover.bind(facade),
  },
  docs: myserviceDocs,
  directTools: [getResourceTool, searchTool],  // Optional
};
```

**Key Points**:
- `name` must be unique (checked at registration)
- `facade` object maps method names to bound facade methods
- `directTools` are optional (omit if not needed)
- Export the const `ServiceAdapter` named exactly as in the import

## Phase 3: Registration

### Step 3.1: Import Adapter in mcp-server.ts

Open [mcp-server.ts](../mcp-server.ts):

```typescript
// Add import (alphabetically, after other service imports):
import { MyServiceAdapter } from './services/myservice/index.js';
```

### Step 3.2: Register with ServiceRegistry

In the same file, find the "Register Adapters" section:

```typescript
// ── Register Adapters ───────────────────────────────────────
ServiceRegistry.register(JiraAdapter);
ServiceRegistry.register(TasksAdapter);
ServiceRegistry.register(AzureSqlAdapter);
ServiceRegistry.register(MyServiceAdapter);  // Add this line
```

### Step 3.3: Verify No Duplicates

Search `mcp-server.ts` to ensure:
- Only one import of `MyServiceAdapter`
- Only one `register(MyServiceAdapter)` call
- No other service with name `myservice`

## Phase 4: Verification

### Step 4.1: Compile

```bash
npm run typecheck
```

If errors appear, fix TypeScript issues before proceeding.

### Step 4.2: Build

```bash
npm run build
```

Ensure it compiles without errors. Check `dist/` exists and contains compiled files.

### Step 4.3: Manual Test

Start the server:

```bash
npm run dev
```

You should see in console:
```
[copilot-api-bridge] Starting with 4 service(s): jira, tasks, sql, myservice
[Registry] Registered service: myservice
```

### Step 4.4: Test in Copilot Chat

1. Reload VS Code: `Cmd+Shift+P` → "Developer: Reload Window"
2. Open Copilot Chat
3. Ask a question using the service:
   - "Use myservice_search_docs to find how to get a resource"
   - "Use myservice_get_resource to fetch res-123"
   - "Execute code against myservice to search for 'test'"

### Step 4.5: Validate Tools Exist

All of these should work in chat:

- `{myservice}_search_docs` — Semantic search (auto-generated)
- `{myservice}_execute` — Code execution (auto-generated)
- `{myservice}_get_resource` — Direct tool (if defined)
- `{myservice}_search` — Direct tool (if defined)

---

## Common Issues and Solutions

### Issue: "Service myservice is already registered"
**Cause**: Service registered twice in `mcp-server.ts`.  
**Solution**: Search for duplicate `ServiceRegistry.register(MyServiceAdapter)` and remove one.

### Issue: Tools don't appear in Copilot
**Cause**: Server not reloaded after registration.  
**Solution**:
1. Restart the server: Kill `npm run dev` and restart
2. Reload VS Code: `Cmd+Shift+P` → "Developer: Reload Window"
3. Wait a few seconds for MCP to reconnect

### Issue: Code generation fails
**Cause**: Invalid API spec or bad input.  
**Solution**:
1. Validate API spec is valid OpenAPI 3.0: Use [swagger.io/tools/swagger-editor](https://swagger.io/tools/swagger-editor)
2. Simplify spec (remove complex nested types)
3. Try manual client writing instead of generation

### Issue: Credentials not working
**Cause**: `.env` not loaded or wrong values.  
**Solution**:
1. Verify `.env` exists in project root
2. Verify values are correct
3. Restart server: `npm run dev`
4. Check console for connection errors

### Issue: Sandbox code execution fails
**Cause**: Facade method not properly bound or injected.  
**Solution**:
1. Verify `facade: { methodName: facade.methodName.bind(facade) }` in adapter export
2. Test method manually in `test-client.ts`
3. Check method names match exactly between facade and docs

---

## Levels of Integration

### Level 1: Simple Read-Only Service (30 min)

Provides read-only access to external data.

**Examples**: Public API, database read-only role

**Requirements**:
- Facade with 2-3 read methods
- No state mutations
- No complex authentication

**Example**: GitHub API integration to search repositories

### Level 2: Read-Write Service (60 min)

Allows creating and modifying data.

**Examples**: Issue tracker, content management

**Requirements**:
- Facade with get, search, create, update, delete methods
- Input validation
- Error handling for conflicts

**Example**: Jira (existing service in the bridge)

### Level 3: Complex Service with Relationships (2-3 hours)

Services with complex interdependencies and workflows.

**Examples**: E-commerce platform, workflow engine

**Requirements**:
- Multiple facades (one per resource type)
- Transaction support
- Rollback and error recovery
- Rich documentation

**Example**: Multi-entity order management system

---

## Next Steps

After onboarding:

1. **Write tests** — Add tests for facade methods
2. **Add mutations** — Support create/update/delete if read-only first
3. **Optimize** — Add more direct tools for hot-path operations
4. **Document** — Add examples and constraints to capabilities
5. **Monitor** — Log usage and performance

---

## References

- [Architecture](architecture.md) — System design details
- [Service Adapters](service-adapters.md) — Detailed patterns
- [Setup Guide](setup.md) — Development environment

---

## Checklist

Before asking for code review:

- [ ] Facade methods are all async
- [ ] All methods have JSDoc comments
- [ ] Documentation file (capabilities.ts) completed
- [ ] Direct tools defined for hot-path operations
- [ ] ServiceAdapter interface properly exported
- [ ] Imported and registered in `mcp-server.ts`
- [ ] `npm run typecheck` passes without errors
- [ ] `npm run build` succeeds
- [ ] Tested in Copilot Chat (at least one tool invocation)
- [ ] Error handling implemented (try/catch blocks present)
- [ ] Environment variables documented in `.env.example`
- [ ] No credentials hardcoded in source files
