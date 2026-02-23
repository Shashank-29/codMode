import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RestApplication} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import path from 'path';
import {
  disposeSandbox,
  handleMcpDelete,
  handleMcpGet,
  handleMcpPost,
} from './mcp-server';
import {MySequence} from './sequence';

export {ApplicationConfig};

export class CodModeApplication extends BootMixin(RestApplication) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

    // Customize @loopback/rest-explorer configuration here
    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };

    // ── Mount MCP Streamable HTTP endpoints ───────────────────
    this.mountMcpEndpoints();

    // ── Graceful shutdown: dispose V8 sandbox pool ────────────
    const cleanup = () => disposeSandbox();
    process.once('SIGTERM', cleanup);
    process.once('SIGINT', cleanup);
  }

  /**
   * Mount MCP protocol endpoints on the underlying Express server.
   *
   * POST /mcp  — JSON-RPC requests (initialize, tools/list, tools/call)
   * GET  /mcp  — SSE streaming (optional, for long-running responses)
   * DELETE /mcp — Session termination
   */
  private mountMcpEndpoints(): void {
    this.expressMiddleware(
      'middleware.mcp',
      (req, res, next) => {
        if (req.path !== '/mcp') {
          next();
          return;
        }

        if (req.method === 'POST') {
          handleMcpPost(req, res).catch(err => {
            console.error('[MCP] POST error:', err);
            if (!res.headersSent) {
              res.writeHead(500, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({error: 'Internal server error'}));
            }
          });
        } else if (req.method === 'GET') {
          handleMcpGet(req, res).catch(err => {
            console.error('[MCP] GET error:', err);
            if (!res.headersSent) {
              res.writeHead(500, {'Content-Type': 'application/json'});
              res.end(JSON.stringify({error: 'Internal server error'}));
            }
          });
        } else if (req.method === 'DELETE') {
          handleMcpDelete(req, res).catch(err => {
            console.error('[MCP] DELETE error:', err);
            if (!res.headersSent) {
              res.writeHead(500);
              res.end();
            }
          });
        } else {
          res.writeHead(405, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({error: 'Method not allowed'}));
        }
      },
    );

    console.log('[CodMode] MCP endpoints mounted at /mcp');
  }
}
