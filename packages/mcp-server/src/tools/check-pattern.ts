/**
 * MCP Tool: check_architectural_compliance
 * Checks code against architectural decisions and constraints.
 * Returns compliance result with any violations found.
 */

import type {
  ArchCategory,
  ArchDecision,
  ComplianceResult,
  CustomRule,
  DbClient,
  Evidence,
  Violation,
  ViolationSeverity,
} from '@archguard/core';
import { generateId, schema, parseJsonSafe } from '@archguard/core';

/** Input schema for check_architectural_compliance tool */
export interface CheckPatternInput {
  code: string;
  filePath: string;
  intent?: string;
}

/** JSON Schema for the tool input */
export const checkPatternInputSchema = {
  type: 'object' as const,
  properties: {
    code: {
      type: 'string' as const,
      description: 'The code to check for architectural compliance.',
    },
    filePath: {
      type: 'string' as const,
      description: 'The file path of the code being checked.',
    },
    intent: {
      type: 'string' as const,
      description:
        'Optional description of what the code is intended to do. Helps provide more relevant compliance checks.',
    },
  },
  required: ['code', 'filePath'] as const,
};

/**
 * Execute the check_architectural_compliance tool.
 * Loads all decisions and custom rules from the database,
 * then checks the provided code against constraints.
 */
export async function executeCheckPattern(
  db: DbClient,
  input: CheckPatternInput,
  customRules: CustomRule[]
): Promise<ComplianceResult> {
  const { code, filePath, intent } = input;
  const violations: Violation[] = [];
  const suggestions: string[] = [];

  // Load all decisions from the database
  const allDecisions = await db.select().from(schema.decisions);
  const allEvidence = await db.select().from(schema.evidence);

  // Group evidence by decision ID
  const evidenceByDecision = new Map<string, Evidence[]>();
  for (const ev of allEvidence) {
    const list = evidenceByDecision.get(ev.decisionId) ?? [];
    list.push({
      filePath: ev.filePath,
      lineRange: [ev.lineStart, ev.lineEnd] as [number, number],
      snippet: ev.snippet,
      explanation: ev.explanation,
    });
    evidenceByDecision.set(ev.decisionId, list);
  }

  // Map DB rows to ArchDecision objects
  const decisions: ArchDecision[] = allDecisions.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as ArchCategory,
    status: row.status as ArchDecision['status'],
    confidence: row.confidence,
    evidence: evidenceByDecision.get(row.id) ?? [],
    constraints: parseJsonSafe<string[]>(row.constraints ?? '[]', []),
    relatedDecisions: parseJsonSafe<string[]>(row.relatedDecisions ?? '[]', []),
    tags: parseJsonSafe<string[]>(row.tags ?? '[]', []),
    detectedAt: row.detectedAt,
    confirmedBy: row.confirmedBy ?? undefined,
  }));

  // Check against decision constraints
  for (const decision of decisions) {
    if (decision.status === 'deprecated') continue;

    for (const constraint of decision.constraints) {
      const violation = checkConstraint(code, filePath, constraint, decision);
      if (violation) {
        violations.push(violation);
      }
    }
  }

  // Check against custom rules from config
  for (const rule of customRules) {
    const violation = checkCustomRule(code, filePath, rule);
    if (violation) {
      violations.push(violation);
    }
  }

  // Generate suggestions based on the code and relevant decisions
  const relevantDecisions = findRelevantDecisions(decisions, filePath, code, intent);
  for (const decision of relevantDecisions) {
    if (decision.constraints.length > 0) {
      suggestions.push(
        `[${decision.title}] Ensure compliance with: ${decision.constraints.join('; ')}`
      );
    }
  }

  if (relevantDecisions.length === 0 && intent) {
    suggestions.push(
      'No specific architectural decisions found for this area. Consider documenting the architectural intent.'
    );
  }

  return {
    compliant: violations.length === 0,
    violations,
    suggestions,
  };
}

/**
 * Check a single constraint against the provided code.
 * Uses heuristic matching to detect common constraint violations.
 */
function checkConstraint(
  code: string,
  filePath: string,
  constraint: string,
  decision: ArchDecision
): Violation | null {
  const constraintLower = constraint.toLowerCase();
  const codeLower = code.toLowerCase();
  const filePathLower = filePath.toLowerCase();

  // Check "should not directly access data storage" constraint
  if (
    constraintLower.includes('should not directly access') &&
    constraintLower.includes('data')
  ) {
    if (
      filePathLower.includes('controller') &&
      (codeLower.includes('query(') ||
        codeLower.includes('.execute(') ||
        codeLower.includes('db.') ||
        codeLower.includes('database') ||
        codeLower.includes('.sql'))
    ) {
      return createViolation(
        filePath,
        code,
        constraint,
        decision,
        'warning'
      );
    }
  }

  // Check "dependencies should point inward" constraint
  if (constraintLower.includes('dependencies should point inward')) {
    if (
      filePathLower.includes('/domain/') &&
      (codeLower.includes("from '../infrastructure") ||
        codeLower.includes("from '../adapters") ||
        codeLower.includes("from '../presentation") ||
        codeLower.includes("from '../ui"))
    ) {
      return createViolation(
        filePath,
        code,
        constraint,
        decision,
        'error'
      );
    }
  }

  // Check "domain layer should have no external dependencies" constraint
  if (
    constraintLower.includes('domain') &&
    constraintLower.includes('no external dependencies')
  ) {
    if (
      filePathLower.includes('/domain/') &&
      hasExternalImports(code)
    ) {
      return createViolation(
        filePath,
        code,
        constraint,
        decision,
        'warning'
      );
    }
  }

  // Check "use constructor injection" constraint
  if (constraintLower.includes('constructor injection')) {
    if (
      codeLower.includes('new ') &&
      !codeLower.includes('constructor') &&
      (filePathLower.includes('service') || filePathLower.includes('controller'))
    ) {
      const newInstances = code.match(/new\s+\w+Service|new\s+\w+Repository|new\s+\w+Controller/gi);
      if (newInstances && newInstances.length > 0) {
        return createViolation(
          filePath,
          code,
          constraint,
          decision,
          'warning'
        );
      }
    }
  }

  // Check "data access should go through repository" constraint
  if (
    constraintLower.includes('data access') &&
    constraintLower.includes('repository')
  ) {
    if (
      !filePathLower.includes('repository') &&
      !filePathLower.includes('repo') &&
      (filePathLower.includes('service') || filePathLower.includes('controller')) &&
      (codeLower.includes('.query(') ||
        codeLower.includes('.execute(') ||
        codeLower.includes('select(') ||
        codeLower.includes('insert(') ||
        codeLower.includes('update(') ||
        codeLower.includes('delete('))
    ) {
      return createViolation(
        filePath,
        code,
        constraint,
        decision,
        'warning'
      );
    }
  }

  return null;
}

/**
 * Check a custom rule from config against the code.
 */
function checkCustomRule(
  code: string,
  filePath: string,
  rule: CustomRule
): Violation | null {
  let patternMatches: boolean;
  try {
    const regex = new RegExp(rule.pattern, 'gi');
    patternMatches = regex.test(code);
  } catch {
    // Invalid regex in config
    return null;
  }

  if (!patternMatches) return null;

  // Check allowedIn / notAllowedIn
  if (rule.allowedIn && rule.allowedIn.length > 0) {
    const isAllowed = rule.allowedIn.some((pattern) => {
      try {
        return new RegExp(pattern).test(filePath);
      } catch {
        return filePath.includes(pattern);
      }
    });

    if (!isAllowed) {
      return {
        id: generateId(),
        rule: rule.name,
        severity: rule.severity,
        message: `Pattern "${rule.pattern}" found in ${filePath} but is only allowed in: ${rule.allowedIn.join(', ')}`,
        filePath,
        lineStart: 1,
        lineEnd: code.split('\n').length,
        suggestion: `Move this code to one of: ${rule.allowedIn.join(', ')}`,
      };
    }
  }

  if (rule.notAllowedIn && rule.notAllowedIn.length > 0) {
    const isBlocked = rule.notAllowedIn.some((pattern) => {
      try {
        return new RegExp(pattern).test(filePath);
      } catch {
        return filePath.includes(pattern);
      }
    });

    if (isBlocked) {
      return {
        id: generateId(),
        rule: rule.name,
        severity: rule.severity,
        message: `Pattern "${rule.pattern}" found in ${filePath} but is not allowed here.`,
        filePath,
        lineStart: 1,
        lineEnd: code.split('\n').length,
        suggestion: `This pattern is prohibited in files matching: ${rule.notAllowedIn.join(', ')}`,
      };
    }
  }

  return null;
}

/** Check if code has external (non-relative) imports */
function hasExternalImports(code: string): boolean {
  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    if (
      !importPath.startsWith('.') &&
      !importPath.startsWith('@/') &&
      !importPath.startsWith('node:')
    ) {
      return true;
    }
  }
  return false;
}

/** Create a violation object */
function createViolation(
  filePath: string,
  code: string,
  constraint: string,
  decision: ArchDecision,
  severity: ViolationSeverity
): Violation {
  return {
    id: generateId(),
    rule: `${decision.title}: ${constraint}`,
    severity,
    message: `Potential violation of constraint: "${constraint}" from decision "${decision.title}"`,
    filePath,
    lineStart: 1,
    lineEnd: code.split('\n').length,
    suggestion: `Review this code against the architectural decision "${decision.title}". Constraint: ${constraint}`,
    decisionId: decision.id,
  };
}

/**
 * Find decisions relevant to the given file and code.
 */
function findRelevantDecisions(
  decisions: ArchDecision[],
  filePath: string,
  code: string,
  intent?: string
): ArchDecision[] {
  const filePathLower = filePath.toLowerCase();
  const codeLower = code.toLowerCase();
  const intentLower = intent?.toLowerCase() ?? '';

  return decisions.filter((decision) => {
    // Check if any evidence file paths are related
    const evidenceMatch = decision.evidence.some((ev) => {
      const evDir = ev.filePath.split('/').slice(0, -1).join('/').toLowerCase();
      const fileDir = filePath.split('/').slice(0, -1).join('/').toLowerCase();
      return evDir === fileDir || filePathLower.includes(evDir) || evDir.includes(fileDir);
    });

    // Check if tags match the file path or code content
    const tagMatch = decision.tags.some(
      (tag) =>
        filePathLower.includes(tag.toLowerCase()) ||
        codeLower.includes(tag.toLowerCase())
    );

    // Check if intent matches decision title or description
    const intentMatch =
      intentLower &&
      (decision.title.toLowerCase().includes(intentLower) ||
        decision.description.toLowerCase().includes(intentLower) ||
        intentLower.includes(decision.title.toLowerCase()));

    return evidenceMatch || tagMatch || intentMatch;
  });
}
