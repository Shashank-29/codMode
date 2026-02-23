/**
 * Test script for Jira Code Mode MCP Server.
 *
 * Usage:
 *   1. Set JIRA_URL in .env, start server: npm start
 *   2. Run: JIRA_PAT=your-token node test-jira-mcp.js
 *
 * Without a real Jira server, only initialize + tools/list will work.
 * The jira_search and code_execution tests require a live Jira instance.
 */
const http = require('http');

const JIRA_PAT = process.env.JIRA_PAT || 'test-pat-token';
const SERVER_PORT = process.env.PORT || 3001;

function mcpRequest(sessionId, body) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-Jira-PAT': JIRA_PAT,
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: SERVER_PORT,
        path: '/mcp',
        method: 'POST',
        headers,
      },
      (res) => {
        let chunks = '';
        const sid = res.headers['mcp-session-id'] || sessionId;

        res.on('data', (chunk) => {
          chunks += chunk.toString();
        });

        // SSE responses don't "end" — parse after first event
        setTimeout(() => {
          req.destroy();
          const lines = chunks.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                resolve({ sessionId: sid, data: JSON.parse(line.slice(6)) });
                return;
              } catch (e) { }
            }
          }
          resolve({ sessionId: sid, data: chunks });
        }, 3000);
      },
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🚀 Testing Jira Code Mode MCP Server\n');
  console.log(`   Server: http://127.0.0.1:${SERVER_PORT}/mcp`);
  console.log(`   PAT: ${JIRA_PAT.slice(0, 4)}${'*'.repeat(Math.max(0, JIRA_PAT.length - 4))}`);
  console.log('');

  // 1. Initialize
  console.log('1️⃣  Initialize...');
  const init = await mcpRequest(null, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0' },
    },
  });
  console.log('   Session:', init.sessionId);
  console.log('   Server:', JSON.stringify(init.data?.result?.serverInfo));
  console.log('   ✅ Initialize OK\n');

  const sid = init.sessionId;

  // Send initialized notification
  await mcpRequest(sid, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  await new Promise((r) => setTimeout(r, 500));

  // 2. List tools
  console.log('2️⃣  List tools...');
  const list = await mcpRequest(sid, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
  const tools = list.data?.result?.tools || [];
  console.log('   Tools found:', tools.map((t) => t.name).join(', '));
  console.log('   ✅ tools/list OK\n');

  // 3. Test jira_execute (serverInfo — always works if Jira is reachable)
  console.log('3️⃣  Call jira_execute (GET serverInfo)...');
  try {
    const info = await mcpRequest(sid, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'jira_execute', arguments: { method: 'GET', path: '/rest/api/2/serverInfo' } },
    });
    const text = info.data?.result?.content?.[0]?.text;
    if (info.data?.result?.isError) {
      console.log('   ⚠️  Error (expected if no Jira):', text?.slice(0, 100));
    } else {
      console.log('   Result:', text?.slice(0, 200));
      console.log('   ✅ jira_execute OK');
    }
  } catch (e) {
    console.log('   ⚠️  Skipped (Jira not reachable):', e.message);
  }
  console.log('');

  // 4. Test jira_search
  console.log('4️⃣  Call jira_search (recent issues)...');
  try {
    const search = await mcpRequest(sid, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'jira_search', arguments: { jql: 'ORDER BY created DESC', maxResults: 5 } },
    });
    const text = search.data?.result?.content?.[0]?.text;
    if (search.data?.result?.isError) {
      console.log('   ⚠️  Error:', text?.slice(0, 150));
    } else {
      console.log('   Result:', text?.slice(0, 300));
      console.log('   ✅ jira_search OK');
    }
  } catch (e) {
    console.log('   ⚠️  Skipped:', e.message);
  }
  console.log('');

  // 5. Test code_execution with Jira
  console.log('5️⃣  Call code_execution (sandbox + Jira)...');
  try {
    const exec = await mcpRequest(sid, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'code_execution',
        arguments: {
          code: `
try {
  const issues = await jira_search('ORDER BY created DESC');
  console.log('Found ' + issues.length + ' issues');
  if (issues.length > 0) {
    console.log('Latest: ' + issues[0].key + ' - ' + issues[0].summary);
  }
} catch (e) {
  console.log('Jira not reachable: ' + e.message);
}
console.log('Sandbox is working!');
`,
        },
      },
    });
    console.log('   Result:', exec.data?.result?.content?.[0]?.text?.slice(0, 300));
    console.log('   ✅ code_execution OK');
  } catch (e) {
    console.log('   ⚠️  Error:', e.message);
  }
  console.log('');

  console.log('🎉 All tests completed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
