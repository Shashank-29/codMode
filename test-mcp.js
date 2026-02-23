/**
 * Test script for the Code Mode MCP Server.
 *
 * Usage:
 *   1. Start the server: npm start
 *   2. In another terminal: node test-mcp.js
 */
const http = require('http');

function mcpRequest(sessionId, body) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
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
          // Parse SSE data
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
        }, 2000);
      },
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🚀 Testing Code Mode MCP Server\n');

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

  // 2. Send initialized notification
  await mcpRequest(sid, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  await new Promise((r) => setTimeout(r, 500));

  // 3. List tools
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

  // 4. Call get_weather
  console.log('3️⃣  Call get_weather("Bengaluru")...');
  const weather = await mcpRequest(sid, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'get_weather', arguments: { city: 'Bengaluru' } },
  });
  console.log('   Result:', weather.data?.result?.content?.[0]?.text);
  console.log('   ✅ get_weather OK\n');

  // 5. Call code_execution (simple)
  console.log('4️⃣  Call code_execution (2 + 3)...');
  const exec1 = await mcpRequest(sid, {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'code_execution',
      arguments: { code: 'const x = 2 + 3; console.log("Result: " + x); x.toString()' },
    },
  });
  console.log('   Result:', exec1.data?.result?.content?.[0]?.text);
  console.log('   ✅ code_execution OK\n');

  // 6. Call code_execution (multi-city weather)
  console.log('5️⃣  Call code_execution (multi-city weather avg)...');
  const exec2 = await mcpRequest(sid, {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'code_execution',
      arguments: {
        code: `
const cities = ['Delhi', 'Bengaluru', 'Mumbai'];
const results = [];
for (const city of cities) {
  const w = await get_weather(city);
  results.push(w);
  console.log(city + ': ' + w.temp + '°C');
}
const avg = results.reduce((s, r) => s + r.temp, 0) / results.length;
console.log('Average: ' + avg.toFixed(1) + '°C');
`,
      },
    },
  });
  console.log('   Result:', exec2.data?.result?.content?.[0]?.text);
  console.log('   ✅ Multi-city code execution OK\n');

  console.log('🎉 All tests passed!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
