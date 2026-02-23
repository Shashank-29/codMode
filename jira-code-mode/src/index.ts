import 'dotenv/config';
import {ApplicationConfig, JiraCodeModeApplication} from './application';

export * from './application';

export async function main(options: ApplicationConfig = {}) {
  const app = new JiraCodeModeApplication(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  console.log(`Jira Code Mode server is running at ${url}`);
  console.log(`MCP endpoint: ${url}/mcp`);
  console.log(`JIRA_URL: ${process.env.JIRA_URL || '(not set)'}`);
  console.log(`JIRA_READONLY: ${process.env.JIRA_READONLY !== 'false' ? 'true' : 'false'}`);

  return app;
}

if (require.main === module) {
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3001),
      host: process.env.HOST ?? '0.0.0.0',
      gracePeriodForClose: 5000,
      openApiSpec: {
        setServersFromRequest: true,
      },
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
