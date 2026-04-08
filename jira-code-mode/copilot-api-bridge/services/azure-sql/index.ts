import { ServiceAdapter, DirectTool } from '../../core/registry/types.js';
import { AzureSqlFacade } from './facade/sql.js';
import { azureSqlDocs } from './docs/capabilities.js';
import { z } from 'zod';

// Instantiate facade locally
const facadeInstance = new AzureSqlFacade();

// Automatically map all methods exposed on the facade
const facadeMap: Record<string, (...args: any[]) => Promise<unknown>> = {
  query: facadeInstance.query.bind(facadeInstance),
  getSchema: facadeInstance.getSchema.bind(facadeInstance),
};

// Expose high-speed "Direct Tools" for SQL operations
const schemaTool: DirectTool = {
  name: 'sql_schema',
  description: 'Quickly get all tables and column schemas from the Azure SQL Database to understand the data model.',
  parameters: {},
  handler: async () => {
    try {
      const schema = await facadeInstance.getSchema();
      return JSON.stringify(schema, null, 2);
    } catch (e: any) {
      return `Error fetching schema: ${e.message}`;
    }
  },
};

const queryTool: DirectTool = {
  name: 'sql_query',
  description: 'Execute a raw SQL query instantly. Use this for fast lookups. Consider using sql_schema first if you do not know the columns.',
  parameters: {
    query: z.string().describe('The raw SQL query to run.')
  },
  handler: async (params: any) => {
    try {
      const result = await facadeInstance.query(params.query);
      return JSON.stringify(result, null, 2);
    } catch (e: any) {
      return `Error executing query: ${e.message}`;
    }
  },
};

export const AzureSqlAdapter: ServiceAdapter = {
  name: 'sql',
  description: 'Azure SQL Server Adapter — Direct Database queries and schema retrieval.',
  facade: facadeMap,
  docs: azureSqlDocs,
  directTools: [schemaTool, queryTool],
};
