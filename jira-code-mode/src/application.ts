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

export class JiraCodeModeApplication extends BootMixin(RestApplication) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    this.sequence(MySequence);
    this.static('/', path.join(__dirname, '../public'));

    this.configure(RestExplorerBindings.COMPONENT).to({
      path: '/explorer',
    });
    this.component(RestExplorerComponent);

    this.projectRoot = __dirname;
    this.bootOptions = {
      controllers: {
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };

    this.mountMcpEndpoints();

    const cleanup = () => disposeSandbox();
    process.once('SIGTERM', cleanup);
    process.once('SIGINT', cleanup);
  }

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

    console.log('[JiraCodeMode] MCP endpoints mounted at /mcp');
  }
}
