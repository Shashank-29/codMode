import * as sql from 'mssql';

export class AzureSqlFacade {
  private pool: sql.ConnectionPool | null = null;
  private connectionString: string;

  constructor() {
    this.connectionString = process.env.AZURE_SQL_CONNECTION_STRING || '';
  }

  private async getPool(): Promise<sql.ConnectionPool> {
    if (!this.connectionString) {
      throw new Error('[AzureSqlFacade] AZURE_SQL_CONNECTION_STRING not set. SQL operations will fail.');
    }
    
    if (this.pool) return this.pool;
    
    this.pool = new sql.ConnectionPool(this.connectionString);
    await this.pool.connect();
    return this.pool;
  }

  /**
   * Run a raw SQL query.
   * @param queryText The SQL query string
   * @returns Array of result records
   */
  async query(queryText: string): Promise<unknown> {
    const pool = await this.getPool();
    const result = await pool.request().query(queryText);
    return result.recordset;
  }

  /**
   * Retrieves the schema of all visible tables in the database.
   * Useful for the LLM to understand what fields exist before building queries.
   */
  async getSchema(): Promise<unknown> {
    const q = `
      SELECT 
          t.name AS TableName,
          c.name AS ColumnName,
          ty.name AS DataType
      FROM sys.tables t
      INNER JOIN sys.columns c ON t.object_id = c.object_id
      INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
      ORDER BY t.name, c.column_id;
    `;
    const pool = await this.getPool();
    const result = await pool.request().query(q);
    
    // Group columns by table
    const schema: Record<string, any[]> = {};
    for (const row of result.recordset) {
      if (!schema[row.TableName]) schema[row.TableName] = [];
      schema[row.TableName].push({ column: row.ColumnName, type: row.DataType });
    }
    return schema;
  }
}
