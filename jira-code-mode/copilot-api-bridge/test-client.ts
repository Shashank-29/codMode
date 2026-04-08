import { spawn } from 'child_process';
import readline from 'readline';

async function main() {
  const mcpServer = spawn('npx', ['tsx', 'mcp-server.ts'], {
    env: { ...process.env, JIRA_READONLY: 'true' },
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const rl = readline.createInterface({
    input: mcpServer.stdout,
    terminal: false
  });

  let messageId = 1;

  function sendData(data: any) {
    mcpServer.stdin.write(JSON.stringify(data) + '\n');
  }

  const p = new Promise<void>((resolve) => {
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id === 1) {
          console.log('\n--- Tools Available ---');
          msg.result.tools.forEach((t: any) => console.log(`- ${t.name}`));

          console.log('\n--- Calling tasks_list ---');
          sendData({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'tasks_list', arguments: {} }
          });
        }
        else if (msg.id === 2) {
          console.log('Result:', JSON.stringify(msg.result.content[0].text, null, 2));
          
          console.log('\n--- Calling tasks_execute (getting stats) ---');
          sendData({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { 
              name: 'tasks_execute', 
              arguments: { code: "return await tasks.getStats();" } 
            }
          });
        }
        else if (msg.id === 3) {
          console.log('Result:', msg.result.content[0].text);
          mcpServer.kill();
          resolve();
        }
      } catch (e) {}
    });
  });

  console.log('Initializing...');
  sendData({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
  });

  setTimeout(() => {
    sendData({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    });
  }, 1000);

  await p;
}

main().catch(console.error);
