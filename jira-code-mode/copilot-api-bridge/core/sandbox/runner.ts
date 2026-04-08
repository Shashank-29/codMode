/**
 * Generic V8 Sandbox Runner for copilot-api-bridge.
 *
 * Executes LLM-generated JavaScript code in an isolated V8 context
 * with a service facade injected as a binding.
 *
 * Key design:
 *   - Service-agnostic: any facade object can be injected
 *   - Facade methods are available as `{serviceName}.methodName(...)`
 *   - No filesystem, network, or env var access from inside the sandbox
 *   - Console output is captured and returned
 *   - Isolate pool for performance (reuse V8 contexts)
 */
import ivm from 'isolated-vm';
import { ServiceAdapter } from '../registry/types.js';

export interface SandboxResult {
  /** Serialized return value of the code */
  output: string;
  /** Captured console.log output */
  logs: string[];
  /** Error message if execution failed */
  error?: string;
}

export class SandboxRunner {
  private pool: ivm.Isolate[] = [];
  private readonly maxPoolSize = 5;
  private readonly memoryLimitMb = 128;
  private readonly timeoutMs = 30_000; // 30s

  constructor() {
    // Pre-warm pool with 3 isolates
    for (let i = 0; i < 3; i++) {
      this.pool.push(new ivm.Isolate({ memoryLimit: this.memoryLimitMb }));
    }
    console.log(`[Sandbox] Pool pre-warmed with ${this.pool.length} isolates`);
  }

  /**
   * Execute code with a service facade injected.
   *
   * Inside the sandbox, the facade is available as:
   *   `const result = await {adapter.name}.someMethod(arg1, arg2);`
   *
   * @param code - JavaScript code to execute
   * @param adapter - The service adapter whose facade to inject
   */
  async execute(code: string, adapter: ServiceAdapter): Promise<SandboxResult> {
    const isolate =
      this.pool.pop() || new ivm.Isolate({ memoryLimit: this.memoryLimitMb });
    const logs: string[] = [];

    try {
      const context = await isolate.createContext();
      const jail = context.global;
      await jail.set('global', jail.derefInto());

      // ── Inject console.log ────────────────────────────────
      await jail.set(
        '_log',
        new ivm.Reference((...args: unknown[]) => {
          logs.push(
            args
              .map((a) =>
                typeof a === 'object' ? JSON.stringify(a) : String(a)
              )
              .join(' ')
          );
        })
      );

      // ── Inject facade methods ─────────────────────────────
      // Each facade method becomes a reference that the sandbox can call.
      // The sandbox code calls them as: serviceName.methodName(args...)
      const facadeMethodNames = Object.keys(adapter.facade).filter(
        (key) => typeof adapter.facade[key] === 'function'
      );

      for (const methodName of facadeMethodNames) {
        const ref = new ivm.Reference(async (...args: unknown[]) => {
          const result = await adapter.facade[methodName](...args);
          return new ivm.ExternalCopy(
            result === undefined ? null : result
          ).copyInto();
        });
        await jail.set(`_facade_${methodName}`, ref);
      }

      // ── Build wrapper code ────────────────────────────────
      const facadeMethodWrappers = facadeMethodNames
        .map(
          (m) =>
            `    async ${m}(...args) { 
              const _raw = await _facade_${m}.apply(undefined, args, { arguments: { copy: true }, result: { promise: true, copy: true } }); 
              return _raw;
            }`
        )
        .join(',\n');

      const wrappedCode = `
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

        const ${adapter.name} = {
${facadeMethodWrappers}
        };

        (async () => {
          const _result = await (async () => { ${code} })();
          return typeof _result === 'undefined' ? null : JSON.stringify(_result);
        })();
      `;

      const script = await isolate.compileScript(wrappedCode);
      const rawResult = await script.run(context, {
        timeout: this.timeoutMs,
        promise: true,
      });

      const result = typeof rawResult === 'string' 
        ? JSON.parse(rawResult) 
        : rawResult;

      let output: string;
      if (result === undefined || result === null) {
        output = logs.length > 0 ? logs[logs.length - 1] : 'undefined';
      } else if (typeof result === 'object') {
        output = JSON.stringify(result, null, 2);
      } else {
        output = String(result);
      }

      return { output, logs };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { output: '', logs, error: errorMsg };
    } finally {
      // Return isolate to pool or dispose if full
      if (this.pool.length < this.maxPoolSize) {
        this.pool.push(isolate);
      } else {
        isolate.dispose();
      }
    }
  }

  /** Dispose all isolates in the pool. */
  dispose(): void {
    for (const isolate of this.pool) {
      isolate.dispose();
    }
    this.pool = [];
    console.log('[Sandbox] All isolates disposed');
  }
}
