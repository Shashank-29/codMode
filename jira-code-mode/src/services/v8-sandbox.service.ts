/**
 * V8SandboxService for Jira Code Mode.
 *
 * Runs JS code in isolated V8 contexts with injected Jira tools:
 *   - jira_search(jql)            → JQL search, returns issue array
 *   - jira_api(method, path, body) → Generic Jira REST call
 *   - console.log()               → Captured and returned
 */
import ivm from 'isolated-vm';
import {JiraService} from './jira.service';

export interface SandboxResult {
  output: string;
  logs: string[];
  error?: string;
}

export class V8SandboxService {
  private pool: ivm.Isolate[] = [];
  private readonly maxPoolSize = 5;
  private readonly memoryLimitMb = 128;
  private readonly timeoutMs = 10000; // 10s for Jira (network calls)

  constructor() {
    for (let i = 0; i < 3; i++) {
      this.pool.push(new ivm.Isolate({memoryLimit: this.memoryLimitMb}));
    }
    console.log(`[V8Sandbox] Pool pre-warmed with ${this.pool.length} isolates`);
  }

  /**
   * Execute JS code with Jira tools injected.
   */
  async execute(code: string, jiraService: JiraService): Promise<SandboxResult> {
    const isolate =
      this.pool.pop() || new ivm.Isolate({memoryLimit: this.memoryLimitMb});
    const logs: string[] = [];

    try {
      const context = await isolate.createContext();
      const jail = context.global;
      await jail.set('global', jail.derefInto());

      // Inject console.log
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

      // Inject jira_search
      const searchRef = new ivm.Reference(async (jql: string) => {
        const results = await jiraService.search(jql);
        return new ivm.ExternalCopy(results).copyInto();
      });
      await jail.set('_jiraSearch', searchRef);

      // Inject jira_api
      const apiRef = new ivm.Reference(
        async (method: string, path: string, body?: string) => {
          const parsedBody = body ? JSON.parse(body) : undefined;
          const result = await jiraService.request(method, path, parsedBody);
          return new ivm.ExternalCopy(result).copyInto();
        },
      );
      await jail.set('_jiraApi', apiRef);

      const wrappedCode = `
        const console = {
          log: (...args) => _log.applySync(undefined, args.map(a =>
            typeof a === 'object' ? JSON.stringify(a) : String(a)
          )),
          error: (...args) => _log.applySync(undefined, ['ERROR:', ...args.map(a =>
            typeof a === 'object' ? JSON.stringify(a) : String(a)
          )]),
        };

        async function jira_search(jql) {
          return _jiraSearch.apply(undefined, [jql], { result: { promise: true, copy: true } });
        }

        async function jira_api(method, path, body) {
          const bodyStr = body ? JSON.stringify(body) : undefined;
          return _jiraApi.apply(undefined, [method, path, bodyStr], { result: { promise: true, copy: true } });
        }

        (async () => {
          ${code}
        })();
      `;

      const script = await isolate.compileScript(wrappedCode);
      const result = await script.run(context, {
        timeout: this.timeoutMs,
        promise: true,
      });

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
      return {output: '', logs, error: errorMsg};
    } finally {
      if (this.pool.length < this.maxPoolSize) {
        this.pool.push(isolate);
      } else {
        isolate.dispose();
      }
    }
  }

  dispose(): void {
    for (const isolate of this.pool) {
      isolate.dispose();
    }
    this.pool = [];
    console.log('[V8Sandbox] All isolates disposed');
  }
}
