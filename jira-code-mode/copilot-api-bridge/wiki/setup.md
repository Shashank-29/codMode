# Development Setup

Step-by-step guide to set up the development environment for copilot-api-bridge.

## System Requirements

- **Node.js**: >=20.0.0 (LTS recommended)
- **npm**: >=10.0.0
- **TypeScript**: 5.6.x (included in devDependencies)
- **VS Code**: Latest stable version
- **Git**: For version control

Check your versions:
```bash
node --version    # Should be >= 20.x.x
npm --version     # Should be >= 10.x.x
```

## Installation

### Step 1: Clone or Download

```bash
# Clone the repository (or download as ZIP)
git clone <repo-url> copilot-api-bridge
cd copilot-api-bridge
```

### Step 2: Install Dependencies

```bash
npm install
```

This installs:
- `@modelcontextprotocol/sdk` — MCP protocol implementation
- `isolated-vm` — V8 sandbox for code execution
- `dotenv` — Environment variable management
- `fuse.js` — Fuzzy search for docs
- `mssql` — Azure SQL database driver
- TypeScript compiler and dev tools

### Step 3: Environment Configuration

Create a `.env` file in the project root:

```env
# Jira Configuration
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_API_TOKEN=your_jira_api_token

# Azure SQL Configuration
MSSQL_CONNECTION_STRING=Server=tcp:yourserver.database.windows.net,1433;Initial Catalog=yourdb;Persist Security Info=False;User ID=yourusername;Password=yourpassword;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;

# (Optional) Logging verbosity
DEBUG=copilot-api-bridge:*
```

**Do NOT commit `.env` to version control.** It's in `.gitignore` by default.

**For collaboration**: Create `.env.example` with template values:

```env
# .env.example
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_API_TOKEN=xxxx_xxxx_xxxx
MSSQL_CONNECTION_STRING=Server=tcp:...
```

### Step 4: Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

Output: Compiled files in `dist/` directory.

**Check for errors**: If build fails, check TypeScript errors with:
```bash
npm run typecheck
```

## Running the Server

### Development Mode

Start the MCP server in development with hot-reload:

```bash
npm run dev
```

This runs [mcp-server.ts](mcp-server.ts) directly via `tsx`, supporting TypeScript natively without compilation.

Output:
```
[copilot-api-bridge] Starting with 3 service(s): jira, tasks, sql
```

### Production Mode

1. Build:
```bash
npm run build
```

2. Run the compiled output:
```bash
node dist/mcp-server.js
```

## Connecting to VS Code

The bridge runs as an MCP server that VS Code Copilot Chat connects to via stdio.

### Configuration

VS Code reads `.vscode/mcp.json` to discover and connect to MCP servers:

```json
{
  "mcpServers": {
    "copilot-api-bridge": {
      "command": "node",
      "args": ["dist/mcp-server.js"],
      "env": {}
    }
  }
}
```

**Note**: Ensure code is compiled to `dist/` before VS Code attempts connection.

### Connection Flow

1. VS Code launches the server: `node dist/mcp-server.js`
2. Server starts stdio transport and connects via stdin/stdout
3. Server registers tools via MCP protocol
4. Copilot Chat automatically discovers all `{service}_{tool}` tools
5. Chat user can invoke tools directly

### Troubleshooting Connection

**Tools not appearing in chat**:
- Check `npm run build` succeeded
- Verify `.vscode/mcp.json` is correct
- Restart VS Code: `Cmd+Shift+P` > "Developer: Reload Window"
- Check console output: Codicon menu > Output > MCP Servers

**Connection errors**:
- Check environment variables are set (`.env`)
- Verify backend services are accessible (Jira, SQL, etc.)
- Check for TypeScript compilation errors

## Project Structure

```
.
├── mcp-server.ts              # Entry point
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── .env                        # Environment (DO NOT COMMIT)
├── .env.example                # Template (commit this)
├── .gitignore
├── .vscode/
│   └── mcp.json               # VS Code MCP server config
├── core/
│   ├── registry/              # Service discovery
│   ├── sandbox/               # V8 code execution
│   └── mcp/                   # Tool factory
├── services/
│   ├── jira/
│   ├── tasks/
│   └── azure-sql/
├── scripts/
│   └── generate.ts            # Utility scripts
├── dist/                       # Compiled output (gitignored)
├── wiki/                       # Documentation (this)
└── README.md                   # Project overview
```

## Development Scripts

```bash
npm run dev          # Run in development mode (tsx)
npm run build        # Compile to dist/
npm run typecheck    # Check TypeScript without emitting
npm run generate     # Run utility scripts (in scripts/generate.ts)
```

## Testing the Services

### Test Client

Use [test-client.ts](test-client.ts) to verify services work before using in Copilot:

```bash
# Run the test client
npx tsx test-client.ts
```

This tests:
- Service registration
- Facade initialization
- Tool factory wiring
- Basic service operations

### Manual Testing in Copilot Chat

1. Start the server: `npm run dev`
2. Reload VS Code: `Cmd+Shift+P` > `Developer: Reload Window`
3. Open Copilot Chat: `Cmd+I` (or Chat icon)
4. Test a service:
   - Ask: "What's the schema of the database?"
   - Ask: "List all my tasks"
   - Ask: "Get issue PROJ-123"

## Debugging

### Enable Debug Logging

Set the DEBUG environment variable:

```bash
DEBUG=copilot-api-bridge:* npm run dev
```

Or in `.env`:
```env
DEBUG=copilot-api-bridge:*
```

### Inspect Sandbox Execution

Add logging to [core/sandbox/runner.ts](core/sandbox/runner.ts):

```typescript
console.log('Code execution:', code);
console.log('Result:', result);
```

### Check Service Registry

Print all registered services:

```bash
npx tsx -e "
import { ServiceRegistry } from './core/registry/service-registry.js';
import { JiraAdapter } from './services/jira/index.js';
ServiceRegistry.register(JiraAdapter);
console.log(ServiceRegistry.list());
"
```

## Adding Service Credentials

### Jira

1. Go to Atlassian Account Settings → Security → API Tokens
2. Create a new token
3. Add to `.env`:
   ```env
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_API_TOKEN=xxxxx
   ```

### Azure SQL

1. Obtain connection string from Azure Portal
2. Add to `.env`:
   ```env
   MSSQL_CONNECTION_STRING=Server=tcp:...
   ```

### Tasks Service

No credentials needed (in-memory).

## Troubleshooting

### "Module not found" errors

**Problem**: TypeScript can't find imported modules.  
**Solution**:
1. Delete `dist/` and `node_modules/`
2. Run `npm install`
3. Run `npm run build`

### "Cannot find .env variables"

**Problem**: `process.env.SOME_VAR` is undefined.  
**Solution**:
1. Create `.env` file at project root
2. Add variable: `SOME_VAR=value`
3. Restart server: `npm run dev`

### Sandbox execution times out

**Problem**: User code takes >30s.  
**Solution**:
- Optimize queries and logic
- Use direct tools for simple lookups instead of code execution
- Check for infinite loops or blocking operations

### "Service is already registered"

**Problem**: Duplicate service name in registry.  
**Solution**:
1. Open `mcp-server.ts`
2. Check for duplicate `ServiceRegistry.register()` calls
3. Each service must have unique `name` property

## Development Workflow

**Typical workflow for service changes:**

1. Edit service facade at `services/{name}/facade/{name}.ts`
2. Update documentation at `services/{name}/docs/capabilities.ts`
3. Run `npm run typecheck` to verify no errors
4. Restart server: `npm run dev` (kill and restart)
5. Reload VS Code and test in Copilot Chat

**For core infrastructure changes:**

1. Edit files in `core/`
2. Run `npm run build`
3. Restart server
4. Reload VS Code

## Next Steps

- Read [Architecture](architecture.md) for system design
- Explore [Onboarding Guide](onboarding.md) to add services
- Review [Services](services/) docs for specific integrations
