/**
 * OpenAPI Client Generator Script
 *
 * Usage: npm run generate -- --service <name> --spec <path-to-spec>
 *
 * Runs swagger-typescript-api to generate a typed client
 * from an OpenAPI/Swagger spec file.
 *
 * Output goes to: services/{name}/generated/api.ts
 * Generated files should NEVER be manually edited.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const serviceIdx = args.indexOf('--service');
const specIdx = args.indexOf('--spec');

if (serviceIdx === -1 || specIdx === -1) {
  console.error('Usage: npm run generate -- --service <name> --spec <path>');
  console.error('Example: npm run generate -- --service payments --spec services/payments/spec/openapi.json');
  process.exit(1);
}

const serviceName = args[serviceIdx + 1];
const specPath = args[specIdx + 1];

if (!serviceName || !specPath) {
  console.error('Both --service and --spec are required.');
  process.exit(1);
}

const outputDir = path.resolve(rootDir, 'services', serviceName, 'generated');
const resolvedSpecPath = path.resolve(rootDir, specPath);

if (!existsSync(resolvedSpecPath)) {
  console.error(`Spec file not found: ${resolvedSpecPath}`);
  process.exit(1);
}

// Create output directory
mkdirSync(outputDir, { recursive: true });

console.log(`[generate] Service: ${serviceName}`);
console.log(`[generate] Spec: ${resolvedSpecPath}`);
console.log(`[generate] Output: ${outputDir}`);

try {
  const { stdout, stderr } = await execAsync(
    `npx -y swagger-typescript-api -p "${resolvedSpecPath}" -o "${outputDir}" -n api.ts --no-client false --axios`,
    { cwd: rootDir }
  );

  if (stdout) console.log(stdout);
  if (stderr) console.error(stderr);

  console.log(`[generate] ✓ Generated client at ${outputDir}/api.ts`);
  console.log(`[generate] Next step: write the facade at services/${serviceName}/facade/${serviceName}.ts`);
} catch (err) {
  console.error(`[generate] ✗ Generation failed:`, err);
  process.exit(1);
}
