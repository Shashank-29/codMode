export const azureSqlDocs = () => `# Azure SQL Server API Capabilities

This service provides direct access to an internal Azure SQL Database environment via the \`sql\` global object within the sandbox environment.

## Important Usage Notes
- You do NOT need to handle connections. The \`sql\` object is already authenticated and connected.
- The environment executes as a readonly or minimally privileged user depending on the injected connection string. Do NOT run DROP statements.
- **ALWAYS use \`sql.getSchema()\` first** if you don't know the exact table structure.

## Available Methods

### \`sql.query(sqlQuery: string)\`
Executes a raw SQL statement against the Azure SQL database.
**Returns:** Always returns an array of objects representing rows.

*Example:*
\`\`\`javascript
const activeUsers = await sql.query("SELECT id, email FROM app_users WHERE is_active = 1");
\`\`\`

### \`sql.getSchema()\`
Quickly fetches a map of all Tables and their Columns in the database context. Grouped by Table Name. Use this before trying to write complex JOINs to ensure field names are correct.
**Returns:** JSON object mapping \`TableName -> Array<{column: string, type: string}>\`

*Example:*
\`\`\`javascript
const schema = await sql.getSchema();
console.log(schema['Products']); 
// => [{ column: 'id', type: 'int' }, { column: 'name', type: 'nvarchar' }]
\`\`\`
`;
