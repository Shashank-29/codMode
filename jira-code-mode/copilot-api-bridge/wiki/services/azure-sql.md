# Azure SQL Service

Direct access to Azure SQL Server database for querying and schema discovery.

## Overview

The Azure SQL service exposes a typed facade for executing SQL queries and retrieving database schema, enabling Copilot to perform data operations with full SQL expressiveness.

## Endpoints and Direct Tools

### `sql_sql_schema` — Get Database Schema

**Parameters**: None

**Returns**: Complete database schema including all tables, columns, data types, and constraints.

**Schema Format**:
```typescript
{
  tables: [
    {
      name: string;
      columns: [
        {
          name: string;
          type: string;           // "int", "varchar", "datetime", etc.
          nullable: boolean;
          isPrimaryKey: boolean;
          isIdentity: boolean;
        }
      ];
      primaryKey?: string[];      // Column names
    }
  ]
}
```

**Use Cases**:
- Understand database structure
- Discovery before writing queries
- Verify column names and types
- Plan complex joins
- Understand relationships

**Example**:
```
User: "What tables are in the database?"
Copilot calls: sql_sql_schema()
Response: {
  tables: [
    { name: "Users", columns: [...] },
    { name: "Orders", columns: [...] },
    { name: "Products", columns: [...] }
  ]
}
```

### `sql_sql_query` — Execute SQL Query

**Parameters**:
- `query` (string, required) — Raw SQL query to execute

**Returns**: Query result as JSON array of objects.

**Query Format**:
- ANSI SQL syntax
- Supports SELECT, CTEs, joins, aggregations
- No mutating operations (UPDATE, DELETE, INSERT) for safety

**Use Cases**:
- Execute SELECT queries
- Aggregate and filter data
- Join multiple tables
- Perform complex calculations
- Export data in structured format

**Example**:
```
User: "How many orders from the last month?"
Copilot calls: sql_sql_query(query="SELECT COUNT(*) as count FROM Orders WHERE CreatedDate > DATEADD(month, -1, GETDATE())")
Response: [{ count: 42 }]
```

## Auto-Generated Tools

### `sql_search_docs` — Semantic Search

Search the Azure SQL capability documentation to find relevant methods.

**Example**:
```
Copilot: "How do I query data?"
sql_search_docs(query="query database")
Response: [
  { name: "query", description: "Execute a raw SQL query...", ... }
]
```

### `sql_execute` — Code Execution

Execute user-generated JavaScript with access to the SQL facade for dynamic query building.

**Example**:
```
User: "Find all users created in the last 7 days, ordered by creation date"
Copilot generates:
  const query = `
    SELECT * FROM Users 
    WHERE CreatedDate > DATEADD(day, -7, GETDATE())
    ORDER BY CreatedDate DESC
  `;
  return await sql.query(query);
```

## Facade Methods

The `AzureSqlFacade` class exposes:

```typescript
class AzureSqlFacade {
  async query(sql: string): Promise<any[]>;
  async getSchema(): Promise<DatabaseSchema>;
}
```

## Authentication

**Mechanism**: SQL authentication via connection string.

**Setup**:
1. Obtain Azure SQL connection string
2. Add to `.env`: `MSSQL_CONNECTION_STRING=Server=...;Database=...;User Id=...;Password=...;`
3. Add to `.env.example` for documentation

**Security**: Connection string is never exposed to Copilot or sandbox. It's bound to the facade at instantiation.

## Documentation

The capability documentation shows:

- **query** method:
  - Parameters: `sql` (string)
  - Example: `query("SELECT * FROM Users WHERE Id = 1")`
  - Returns: Array of result rows
  
- **getSchema** method:
  - Parameters: None
  - Returns: Complete database schema with tables and columns

## Query Examples

### Get all active users
```sql
SELECT Id, Name, Email, CreatedDate 
FROM Users 
WHERE Status = 'Active' 
ORDER BY CreatedDate DESC
```

### Join orders with customers
```sql
SELECT 
  c.Name as Customer,
  o.OrderId,
  o.TotalAmount,
  o.CreatedDate
FROM Orders o
INNER JOIN Customers c ON o.CustomerId = c.Id
WHERE o.CreatedDate > DATEADD(day, -30, GETDATE())
ORDER BY o.TotalAmount DESC
```

### Aggregate sales by product
```sql
SELECT 
  p.ProductName,
  COUNT(o.OrderId) as SalesCount,
  SUM(o.TotalAmount) as TotalRevenue,
  AVG(o.TotalAmount) as AvgOrderSize
FROM Orders o
INNER JOIN OrderLines ol ON o.OrderId = ol.OrderId
INNER JOIN Products p ON ol.ProductId = p.Id
GROUP BY p.ProductName
ORDER BY TotalRevenue DESC
```

### Complex CTE example
```sql
WITH RecentOrders AS (
  SELECT 
    CustomerId,
    COUNT(*) as OrderCount,
    SUM(TotalAmount) as TotalSpent
  FROM Orders
  WHERE CreatedDate > DATEADD(year, -1, GETDATE())
  GROUP BY CustomerId
)
SELECT 
  c.Name,
  ro.OrderCount,
  ro.TotalSpent
FROM RecentOrders ro
INNER JOIN Customers c ON ro.CustomerId = c.Id
WHERE ro.OrderCount > 5
ORDER BY ro.TotalSpent DESC
```

## In JavaScript (Code Execution)

### Build query dynamically
```javascript
const tableName = "Orders";
const days = 30;
const query = `
  SELECT * FROM ${tableName}
  WHERE CreatedDate > DATEADD(day, -${days}, GETDATE())
  LIMIT 100
`;
return await sql.query(query);
```

### Process results in code
```javascript
const users = await sql.query("SELECT * FROM Users WHERE Status = 'Active'");
const sorted = users.sort((a, b) => 
  new Date(b.CreatedDate) - new Date(a.CreatedDate)
);
const recent = sorted.slice(0, 10);
return recent.map(u => ({ id: u.Id, name: u.Name }));
```

### Multi-step analysis
```javascript
// Get schema
const schema = await sql.getSchema();
const userTable = schema.tables.find(t => t.name === 'Users');

// Build query based on available columns
const hasEmail = userTable.columns.some(c => c.name === 'Email');
const query = hasEmail 
  ? "SELECT Id, Name, Email FROM Users"
  : "SELECT Id, Name FROM Users";

return await sql.query(query);
```

## Error Handling

**Common Errors**:

| Error | Cause | Solution |
|-------|-------|----------|
| Connection failed | Invalid connection string or credentials | Check `MSSQL_CONNECTION_STRING` in `.env` |
| Timeout | Query takes >30s | Optimize query or add WHERE clauses |
| Table not found | Table name misspelled | Use `sql_sql_schema` to verify table names |
| Column not found | Column name incorrect | Check schema for exact column names |
| Syntax error | Invalid SQL syntax | Review SQL syntax; test in SQL Server Management Studio first |

## Configuration

### Environment Variables

```env
MSSQL_CONNECTION_STRING=Server=tcp:myserver.database.windows.net,1433;Initial Catalog=mydb;Persist Security Info=False;User ID=myuser;Password=mypassword;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

### Connection Pooling

The facade automatically manages connection pooling:
- Default pool size: 10 connections
- Connection timeout: 30 seconds
- Idle connection reuse

## Performance Considerations

- **First query**: ~200-500ms (connection establishment)
- **Subsequent queries**: ~50-200ms (pool reuse)
- **Large result sets**: Streamed to avoid memory exhaustion
- **Query timeout**: 30 seconds absolute limit (sandbox enforcement)
- **Result size limit**: Results automatically truncated at 128MB sandbox memory limit

## Security and Data Protection

**Important**: This service has direct database access. Use with caution in production.

**Best Practices**:
1. Use read-only database roles for the connection user
2. Restrict database access to authorized networks
3. Enable Azure SQL auditing
4. Log all queries for compliance
5. Never expose connection strings in logs or error messages
6. Use parameterized queries (though not directly supported in this version)

**Current Limitation**: Queries use string interpolation, not parameterized queries. Be cautious with untrusted input.

## Location

- **Facade**: [services/azure-sql/facade/sql.ts](../../services/azure-sql/facade/sql.ts)
- **Documentation**: [services/azure-sql/docs/capabilities.ts](../../services/azure-sql/docs/capabilities.ts)
- **Adapter**: [services/azure-sql/index.ts](../../services/azure-sql/index.ts)
- **OpenAPI Spec**: [services/azure-sql/spec/](../../services/azure-sql/spec/)

## Testing

### Manual Test

```bash
npm run dev  # Start MCP server

# In VS Code Copilot Chat:
# "Show me the database schema"
# sql_sql_schema should return table definitions
# "Count users created in the last week"
# sql_execute should run the query
```

## Known Limitations

- Read-only queries (SELECT only, no mutations)
- No parameterized queries (use string interpolation)
- 30-second timeout enforced
- 128MB result size limit
- No streaming of large result sets
- No transaction support

## Future Enhancements

- Parameterized query support
- Write operations (INSERT, UPDATE, DELETE) with audit logging
- Transaction support
- Query optimization suggestions
- Query execution plan analysis
- Backup and restore integration
- Migration tools
- Data export to CSV/JSON
- Change tracking and versioning
