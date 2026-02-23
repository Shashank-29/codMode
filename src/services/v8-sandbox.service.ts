/**
 * V8SandboxService — Runs user code in isolated V8 isolates.
 *
 * Uses `isolated-vm` to create lightweight V8 isolates with:
 *   - 128 MB memory cap per isolate
 *   - 5 s execution timeout
 *   - Pre-warmed isolate pool (3 ready, max 5 pooled)
 *   - Tool injection via `evalClosure` for async host functions
 *   - Console.log capture returned alongside the result
 *
 * This mirrors Cloudflare's Code Mode architecture (Dynamic Worker V8 isolates)
 * but runs entirely on localhost.
 */
import ivm from 'isolated-vm';
import {WeatherService} from './weather.service';

export interface SandboxResult {
  output: string;
  logs: string[];
  error?: string;
}

export class V8SandboxService {
  private pool: ivm.Isolate[] = [];
  private readonly maxPoolSize = 5;
  private readonly memoryLimitMb = 128;
  private readonly timeoutMs = 5000;
  private weatherService: WeatherService;

  constructor() {
    this.weatherService = new WeatherService();
    // Pre-warm 3 isolates
    for (let i = 0; i < 3; i++) {
      this.pool.push(new ivm.Isolate({memoryLimit: this.memoryLimitMb}));
    }
    console.log(`[V8Sandbox] Pool pre-warmed with ${this.pool.length} isolates`);
  }

  /**
   * Execute JavaScript code in an isolated V8 context.
   *
   * Available inside the sandbox:
   *   - console.log(...args) — captured and returned in `logs`
   *   - get_weather(city)    — async, returns { city, temp, humidity, condition }
   *
   * @param code - JavaScript code string to execute
   * @returns SandboxResult with output, logs, and optional error
   */
  async execute(code: string): Promise<SandboxResult> {
    const isolate =
      this.pool.pop() || new ivm.Isolate({memoryLimit: this.memoryLimitMb});

    const logs: string[] = [];

    try {
      const context = await isolate.createContext();
      const jail = context.global;

      // Make the global object accessible as `global`
      await jail.set('global', jail.derefInto());

      // ── Inject console.log ──────────────────────────────────
      await jail.set(
        '_log',
        new ivm.Reference((...args: unknown[]) => {
          logs.push(
            args
              .map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
              .join(' '),
          );
        }),
      );

      // ── Inject get_weather as an async-capable tool ─────────
      const weatherRef = new ivm.Reference(async (city: string) => {
        const result = await this.weatherService.getWeather(city);
        return new ivm.ExternalCopy(result).copyInto();
      });
      await jail.set('_getWeather', weatherRef);

      // ── Wrapper code that sets up the sandbox environment ───
      const wrappedCode = `
        // Set up console
        const console = {
          log: (...args) => _log.applySync(undefined, args.map(a =>
            typeof a === 'object' ? JSON.stringify(a) : String(a)
          )),
          error: (...args) => _log.applySync(undefined, ['ERROR:', ...args.map(a =>
            typeof a === 'object' ? JSON.stringify(a) : String(a)
          )]),
          warn: (...args) => _log.applySync(undefined, ['WARN:', ...args.map(a =>
            typeof a === 'object' ? JSON.stringify(a) : String(a)
          )]),
        };

        // Set up get_weather (async tool)
        async function get_weather(city) {
          return _getWeather.apply(undefined, [city], { result: { promise: true, copy: true } });
        }

        // Execute user code
        (async () => {
          ${code}
        })();
      `;

      const script = await isolate.compileScript(wrappedCode);
      const result = await script.run(context, {
        timeout: this.timeoutMs,
        promise: true,
      });

      // Convert result to string
      let output: string;
      if (result === undefined || result === null) {
        output = logs.length > 0 ? logs[logs.length - 1] : 'undefined';
      } else if (typeof result === 'object') {
        output = JSON.stringify(result, null, 2);
      } else {
        output = String(result);
      }

      return {output, logs};
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        output: '',
        logs,
        error: errorMsg,
      };
    } finally {
      // Return isolate to pool if under max
      if (this.pool.length < this.maxPoolSize) {
        this.pool.push(isolate);
      } else {
        isolate.dispose();
      }
    }
  }

  /**
   * Dispose all pooled isolates (for graceful shutdown).
   */
  dispose(): void {
    for (const isolate of this.pool) {
      isolate.dispose();
    }
    this.pool = [];
    console.log('[V8Sandbox] All isolates disposed');
  }
}
