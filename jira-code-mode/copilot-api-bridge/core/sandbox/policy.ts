/**
 * Write-operation policy for the sandbox.
 *
 * Scans code submitted to the execute tool to detect potentially
 * mutating operations. Used to flag executions that need confirmation.
 */

/** Method name prefixes that indicate a write/mutation. */
const MUTATING_PREFIXES = [
  'create',
  'update',
  'delete',
  'remove',
  'move',
  'assign',
  'add',
  'set',
  'transition',
  'post',
  'put',
];

export interface PolicyCheckResult {
  /** Whether the code contains potentially mutating operations */
  hasMutations: boolean;
  /** List of detected mutating method calls */
  detectedMethods: string[];
}

/**
 * Check if code contains potentially mutating facade method calls.
 *
 * This is a simple static analysis — it pattern-matches against
 * known mutating method name prefixes. Not foolproof, but catches
 * the common cases.
 *
 * @param code - The TypeScript/JavaScript code to analyze
 * @param facadeName - The facade variable name (e.g., "jira")
 */
export function checkMutationPolicy(
  code: string,
  facadeName: string
): PolicyCheckResult {
  const detectedMethods: string[] = [];

  // Match patterns like: jira.createIssue( or await jira.moveIssueToStatus(
  const methodCallRegex = new RegExp(
    `${escapeRegex(facadeName)}\\.(\\w+)\\s*\\(`,
    'g'
  );

  let match: RegExpExecArray | null;
  while ((match = methodCallRegex.exec(code)) !== null) {
    const methodName = match[1];
    const lowerMethod = methodName.toLowerCase();

    if (MUTATING_PREFIXES.some((prefix) => lowerMethod.startsWith(prefix))) {
      if (!detectedMethods.includes(methodName)) {
        detectedMethods.push(methodName);
      }
    }
  }

  return {
    hasMutations: detectedMethods.length > 0,
    detectedMethods,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
