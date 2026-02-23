# Code Mode MCP Agent

Local MCP server that enables VS Code Copilot Chat to execute JavaScript code in secure V8 isolate sandboxes.

## Available Tools

### `get_weather`
Get current weather data for any city.

**Input:** `{ "city": "Bengaluru" }`
**Output:** `{ "city": "Bengaluru", "temp": 32, "humidity": 58, "condition": "Partly Cloudy" }`

### `code_execution`
Execute JavaScript code in a sandboxed V8 isolate with injected tools.

**Available inside sandbox:**
- `console.log()` — Captured and returned
- `get_weather(city)` — Async, returns weather data

**Example:**
```javascript
const cities = ['Delhi', 'Bengaluru', 'Mumbai'];
const results = [];
for (const city of cities) {
  const w = await get_weather(city);
  results.push(`${w.city}: ${w.temp}°C`);
}
const temps = results.map(r => parseInt(r.split(': ')[1]));
const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
console.log(`Weather: ${results.join(', ')}`);
console.log(`Average: ${avg.toFixed(1)}°C`);
```

## Setup
```bash
npm run build && npm start
# Server at http://localhost:3000
# MCP endpoint at http://localhost:3000/mcp
```

## Architecture
- **LB4 (LoopBack 4)** — TypeScript REST framework
- **isolated-vm** — V8 isolate sandboxing (128MB, 5s timeout)
- **@modelcontextprotocol/sdk** — MCP Streamable HTTP transport
