/**
 * Deterministic rule matching engine for architectural code review.
 * Takes ArchDecision[] and CustomRule[] from config and checks diffs
 * against import violations, file placement violations, naming convention
 * violations, and custom pattern violations defined in .snoutguard.yml.
 */

import type {
  ArchDecision,
  CustomRule,
  Violation,
  ViolationSeverity,
  FileDiff,
} from '@snoutguard/core';
import { generateId, now } from '@snoutguard/core';
import type { ChangeContext, DiffAnalysis } from './diff-analyzer.js';

// ─── Types ────────────────────────────────────────────────────────

/** Configuration for the rule engine */
export interface RuleEngineConfig {
  /** Architectural decisions to enforce */
  decisions: ArchDecision[];
  /** Custom rules from .snoutguard.yml */
  customRules: CustomRule[];
}

/** A layer boundary rule inferred from architectural decisions */
interface LayerBoundary {
  /** The layer name (e.g., "domain", "infrastructure", "application") */
  layer: string;
  /** Directory patterns that belong to this layer */
  patterns: string[];
  /** Layers that this layer is NOT allowed to import from */
  forbiddenImports: string[];
  /** The decision this boundary was inferred from */
  decisionId: string;
}

// ─── Well-Known Layer Patterns ────────────────────────────────────

/** Common architectural layer patterns and their typical directory names */
const WELL_KNOWN_LAYERS: Record<string, string[]> = {
  domain: ['domain', 'entities', 'models', 'core/domain', 'core/entities'],
  application: ['application', 'use-cases', 'usecases', 'services', 'app'],
  infrastructure: ['infrastructure', 'infra', 'adapters', 'persistence', 'repositories/impl'],
  presentation: ['presentation', 'controllers', 'routes', 'handlers', 'api', 'web', 'ui'],
  shared: ['shared', 'common', 'utils', 'lib', 'helpers'],
};

/** Default forbidden import directions for layered architecture */
const DEFAULT_LAYER_RESTRICTIONS: Record<string, string[]> = {
  domain: ['infrastructure', 'presentation', 'application'],
  application: ['infrastructure', 'presentation'],
  infrastructure: ['presentation'],
  presentation: [],
  shared: [],
};

// ─── Main Rule Engine ─────────────────────────────────────────────

/**
 * Run all rule checks against a diff analysis.
 * Returns a list of violations found by deterministic rule matching.
 */
export function checkRules(
  diffAnalysis: DiffAnalysis,
  config: RuleEngineConfig
): Violation[] {
  const violations: Violation[] = [];

  // Infer layer boundaries from architectural decisions
  const layerBoundaries = inferLayerBoundaries(config.decisions);

  // Run each rule check category
  violations.push(
    ...checkImportViolations(diffAnalysis.changeContexts, layerBoundaries)
  );
  violations.push(
    ...checkFilePlacementViolations(diffAnalysis.fileDiffs, config.decisions)
  );
  violations.push(
    ...checkNamingConventionViolations(diffAnalysis.fileDiffs, config.decisions)
  );
  violations.push(
    ...checkCustomRuleViolations(diffAnalysis.changeContexts, config.customRules)
  );

  return violations;
}

// ─── Import Violation Checks ──────────────────────────────────────

/**
 * Check for import violations based on architectural layer boundaries.
 * For example, a domain layer file should not import from infrastructure.
 */
function checkImportViolations(
  contexts: ChangeContext[],
  boundaries: LayerBoundary[]
): Violation[] {
  const violations: Violation[] = [];

  for (const ctx of contexts) {
    if (ctx.newImports.length === 0) continue;

    // Determine which layer this file belongs to
    const sourceLayer = identifyLayer(ctx.filePath, boundaries);
    if (!sourceLayer) continue;

    // Check each new import against forbidden layers
    for (const importLine of ctx.newImports) {
      const importPath = extractImportPath(importLine);
      if (!importPath) continue;

      const targetLayer = identifyLayerFromImport(importPath, boundaries);
      if (!targetLayer) continue;

      if (sourceLayer.forbiddenImports.includes(targetLayer.layer)) {
        violations.push({
          id: generateId(),
          rule: 'import-violation',
          severity: 'error',
          message: `Layer violation: "${sourceLayer.layer}" should not import from "${targetLayer.layer}". ` +
            `Found import of "${importPath}" in ${ctx.filePath}.`,
          filePath: ctx.filePath,
          lineStart: ctx.lineStart,
          lineEnd: ctx.lineEnd,
          suggestion: `Move the dependency behind an interface/port in the "${sourceLayer.layer}" layer, ` +
            `and implement it in the "${targetLayer.layer}" layer using dependency inversion.`,
          decisionId: sourceLayer.decisionId,
        });
      }
    }
  }

  return violations;
}

/**
 * Identify which layer boundary a file belongs to based on its path.
 */
function identifyLayer(
  filePath: string,
  boundaries: LayerBoundary[]
): LayerBoundary | null {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

  for (const boundary of boundaries) {
    for (const pattern of boundary.patterns) {
      const normalizedPattern = pattern.toLowerCase();
      if (
        normalizedPath.includes(`/${normalizedPattern}/`) ||
        normalizedPath.startsWith(`${normalizedPattern}/`)
      ) {
        return boundary;
      }
    }
  }

  return null;
}

/**
 * Identify which layer an import target belongs to.
 */
function identifyLayerFromImport(
  importPath: string,
  boundaries: LayerBoundary[]
): LayerBoundary | null {
  const normalizedImport = importPath.replace(/\\/g, '/').toLowerCase();

  for (const boundary of boundaries) {
    for (const pattern of boundary.patterns) {
      const normalizedPattern = pattern.toLowerCase();
      if (
        normalizedImport.includes(`/${normalizedPattern}/`) ||
        normalizedImport.startsWith(`${normalizedPattern}/`) ||
        normalizedImport.includes(`/${normalizedPattern}`)
      ) {
        return boundary;
      }
    }
  }

  return null;
}

/**
 * Extract the import path/module from an import statement.
 */
function extractImportPath(importLine: string): string | null {
  const trimmed = importLine.trim();

  // ES module: import ... from 'path' or import ... from "path"
  const fromMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
  if (fromMatch) return fromMatch[1];

  // CommonJS: require('path') or require("path")
  const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (requireMatch) return requireMatch[1];

  // Direct import: import 'path'
  const directMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
  if (directMatch) return directMatch[1];

  return null;
}

// ─── File Placement Violation Checks ──────────────────────────────

/**
 * Check that files are placed in the expected directories based on
 * architectural decisions about project structure.
 */
function checkFilePlacementViolations(
  fileDiffs: FileDiff[],
  decisions: ArchDecision[]
): Violation[] {
  const violations: Violation[] = [];

  // Extract structural decisions that define expected file placement
  const structuralDecisions = decisions.filter(
    (d) => d.category === 'structural' && d.status !== 'deprecated'
  );

  // Build expected placement rules from structural decisions
  const placementRules = buildPlacementRules(structuralDecisions);

  // Only check newly added files for placement violations
  const newFiles = fileDiffs.filter((d) => d.status === 'added');

  for (const file of newFiles) {
    for (const rule of placementRules) {
      if (matchesFilePattern(file.filePath, rule.filePattern)) {
        if (!matchesDirectoryPattern(file.filePath, rule.expectedDirs)) {
          violations.push({
            id: generateId(),
            rule: 'file-placement',
            severity: 'warning',
            message: `File "${file.filePath}" matches pattern "${rule.filePattern}" but is not placed in ` +
              `an expected directory (${rule.expectedDirs.join(', ')}).`,
            filePath: file.filePath,
            lineStart: 1,
            lineEnd: 1,
            suggestion: `Consider moving this file to one of the expected directories: ${rule.expectedDirs.join(', ')}. ` +
              `This convention was established in decision "${rule.decisionTitle}".`,
            decisionId: rule.decisionId,
          });
        }
      }
    }
  }

  return violations;
}

/** A placement rule derived from an architectural decision */
interface PlacementRule {
  filePattern: string;
  expectedDirs: string[];
  decisionId: string;
  decisionTitle: string;
}

/**
 * Build file placement rules from structural decisions.
 * Looks at constraints and evidence to infer where certain file types should go.
 */
function buildPlacementRules(decisions: ArchDecision[]): PlacementRule[] {
  const rules: PlacementRule[] = [];

  for (const decision of decisions) {
    // Look for constraints that define file placement patterns
    for (const constraint of decision.constraints) {
      const placementMatch = constraint.match(
        /(?:files?\s+matching|files?\s+like|pattern)\s+['"`]?([^\s'"`,]+)['"`]?\s+(?:should\s+be\s+in|belong\s+in|go\s+in)\s+['"`]?([^\s'"`,]+)['"`]?/i
      );

      if (placementMatch) {
        rules.push({
          filePattern: placementMatch[1],
          expectedDirs: [placementMatch[2]],
          decisionId: decision.id,
          decisionTitle: decision.title,
        });
        continue;
      }

      // Look for simpler directory assignment constraints
      const dirMatch = constraint.match(
        /(?:place|put|keep)\s+(?:all\s+)?(\w+)\s+(?:files?\s+)?(?:in|under|within)\s+['"`]?([^\s'"`,]+)['"`]?/i
      );

      if (dirMatch) {
        rules.push({
          filePattern: `*.${dirMatch[1].toLowerCase()}`,
          expectedDirs: [dirMatch[2]],
          decisionId: decision.id,
          decisionTitle: decision.title,
        });
      }
    }

    // Infer placement rules from evidence patterns
    if (decision.evidence.length > 0) {
      const evidenceDirs = new Set<string>();
      for (const ev of decision.evidence) {
        const dir = ev.filePath.split('/').slice(0, -1).join('/');
        if (dir) evidenceDirs.add(dir);
      }

      if (evidenceDirs.size > 0 && decision.constraints.length > 0) {
        // Check if any constraint mentions file types that should follow the evidence pattern
        for (const constraint of decision.constraints) {
          const typeMatch = constraint.match(
            /(\w+)\s+(?:files?|modules?|components?)\s+(?:must|should)/i
          );
          if (typeMatch) {
            rules.push({
              filePattern: `*${typeMatch[1].toLowerCase()}*`,
              expectedDirs: Array.from(evidenceDirs),
              decisionId: decision.id,
              decisionTitle: decision.title,
            });
          }
        }
      }
    }
  }

  return rules;
}

/**
 * Check if a file path matches a simple file pattern (e.g., *.service.ts, *Controller*).
 */
function matchesFilePattern(filePath: string, pattern: string): boolean {
  const fileName = filePath.split('/').pop() || '';

  // Convert simple glob pattern to regex
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  try {
    const regex = new RegExp(`^${regexStr}$`, 'i');
    return regex.test(fileName) || regex.test(filePath);
  } catch {
    return false;
  }
}

/**
 * Check if a file path is under one of the expected directories.
 */
function matchesDirectoryPattern(filePath: string, expectedDirs: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

  return expectedDirs.some((dir) => {
    const normalizedDir = dir.replace(/\\/g, '/').toLowerCase();
    return (
      normalizedPath.startsWith(normalizedDir + '/') ||
      normalizedPath.includes('/' + normalizedDir + '/')
    );
  });
}

// ─── Naming Convention Violation Checks ───────────────────────────

/**
 * Check for naming convention violations based on architectural decisions.
 * Looks for files and exports that don't follow established naming patterns.
 */
function checkNamingConventionViolations(
  fileDiffs: FileDiff[],
  decisions: ArchDecision[]
): Violation[] {
  const violations: Violation[] = [];

  // Extract naming conventions from decisions
  const namingRules = extractNamingRules(decisions);

  const newAndModifiedFiles = fileDiffs.filter(
    (d) => d.status === 'added' || d.status === 'modified'
  );

  for (const file of newAndModifiedFiles) {
    for (const rule of namingRules) {
      if (isFileInScope(file.filePath, rule.scopeDirs)) {
        if (!matchesNamingConvention(file.filePath, rule.convention)) {
          violations.push({
            id: generateId(),
            rule: 'naming-convention',
            severity: 'warning',
            message: `File "${file.filePath}" does not follow the naming convention "${rule.convention}" ` +
              `expected in ${rule.scopeDirs.join(', ')}.`,
            filePath: file.filePath,
            lineStart: 1,
            lineEnd: 1,
            suggestion: `Rename the file to follow the ${rule.convention} convention. ` +
              `Examples: ${rule.examples.join(', ')}.`,
            decisionId: rule.decisionId,
          });
        }
      }
    }
  }

  return violations;
}

/** A naming convention rule derived from architectural decisions */
interface NamingRule {
  convention: string;
  scopeDirs: string[];
  examples: string[];
  decisionId: string;
}

/**
 * Extract naming convention rules from architectural decisions.
 */
function extractNamingRules(decisions: ArchDecision[]): NamingRule[] {
  const rules: NamingRule[] = [];

  for (const decision of decisions) {
    if (decision.status === 'deprecated') continue;

    for (const constraint of decision.constraints) {
      // Look for naming convention constraints
      const namingMatch = constraint.match(
        /(?:use|follow|apply)\s+(\w[\w-]*(?:\s+\w[\w-]*)?)\s+(?:naming|convention|casing)/i
      );

      if (namingMatch) {
        const convention = namingMatch[1].toLowerCase().trim();
        const scopeDirs = decision.evidence.length > 0
          ? [...new Set(decision.evidence.map((e) => {
              const parts = e.filePath.split('/');
              return parts.length > 1 ? parts[0] : '.';
            }))]
          : ['src'];

        rules.push({
          convention,
          scopeDirs,
          examples: generateNamingExamples(convention),
          decisionId: decision.id,
        });
      }

      // Look for suffix/prefix requirements
      const suffixMatch = constraint.match(
        /(?:files?|modules?|components?)\s+(?:in|under)\s+['"`]?(\S+)['"`]?\s+(?:must|should)\s+(?:end|suffix)\s+(?:with|in)\s+['"`]?(\S+)['"`]?/i
      );

      if (suffixMatch) {
        rules.push({
          convention: `suffix:${suffixMatch[2]}`,
          scopeDirs: [suffixMatch[1]],
          examples: [`example${suffixMatch[2]}`],
          decisionId: decision.id,
        });
      }
    }
  }

  return rules;
}

/**
 * Check if a file is within the scope directories for a naming rule.
 */
function isFileInScope(filePath: string, scopeDirs: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  return scopeDirs.some((dir) => {
    const normalizedDir = dir.replace(/\\/g, '/').toLowerCase();
    return (
      normalizedPath.startsWith(normalizedDir + '/') ||
      normalizedPath.includes('/' + normalizedDir + '/')
    );
  });
}

/**
 * Check if a file name matches a naming convention.
 */
function matchesNamingConvention(filePath: string, convention: string): boolean {
  const fileName = filePath.split('/').pop() || '';
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, '');

  // Handle suffix conventions
  if (convention.startsWith('suffix:')) {
    const suffix = convention.slice('suffix:'.length);
    return fileName.includes(suffix);
  }

  switch (convention) {
    case 'kebab case':
    case 'kebab-case':
      return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(nameWithoutExt);

    case 'camel case':
    case 'camelcase':
      return /^[a-z][a-zA-Z0-9]*$/.test(nameWithoutExt);

    case 'pascal case':
    case 'pascalcase':
      return /^[A-Z][a-zA-Z0-9]*$/.test(nameWithoutExt);

    case 'snake case':
    case 'snake_case':
      return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(nameWithoutExt);

    default:
      // If convention is unknown, don't flag it
      return true;
  }
}

/**
 * Generate example file names for a given naming convention.
 */
function generateNamingExamples(convention: string): string[] {
  switch (convention) {
    case 'kebab case':
    case 'kebab-case':
      return ['user-service.ts', 'auth-controller.ts', 'data-mapper.ts'];
    case 'camel case':
    case 'camelcase':
      return ['userService.ts', 'authController.ts', 'dataMapper.ts'];
    case 'pascal case':
    case 'pascalcase':
      return ['UserService.ts', 'AuthController.ts', 'DataMapper.ts'];
    case 'snake case':
    case 'snake_case':
      return ['user_service.ts', 'auth_controller.ts', 'data_mapper.ts'];
    default:
      return [];
  }
}

// ─── Custom Rule Violation Checks ─────────────────────────────────

/**
 * Check for violations of custom rules defined in .snoutguard.yml.
 * Custom rules use pattern matching with allowedIn/notAllowedIn directory constraints.
 */
function checkCustomRuleViolations(
  contexts: ChangeContext[],
  customRules: CustomRule[]
): Violation[] {
  const violations: Violation[] = [];

  for (const rule of customRules) {
    let patternRegex: RegExp;
    try {
      patternRegex = new RegExp(rule.pattern);
    } catch {
      // Skip invalid patterns
      continue;
    }

    for (const ctx of contexts) {
      // Check added lines against the pattern
      for (let i = 0; i < ctx.addedLines.length; i++) {
        const line = ctx.addedLines[i];
        if (!patternRegex.test(line)) continue;

        const filePath = ctx.filePath;
        const normalizedPath = filePath.replace(/\\/g, '/');

        // Check notAllowedIn constraint
        if (rule.notAllowedIn && rule.notAllowedIn.length > 0) {
          const isInForbiddenDir = rule.notAllowedIn.some((dir) =>
            normalizedPath.includes(dir)
          );

          if (isInForbiddenDir) {
            violations.push({
              id: generateId(),
              rule: `custom:${rule.name}`,
              severity: rule.severity,
              message: `Custom rule "${rule.name}" violated: pattern "${rule.pattern}" found in ` +
                `"${filePath}" which is in a restricted directory.`,
              filePath,
              lineStart: ctx.lineStart + i,
              lineEnd: ctx.lineStart + i,
              suggestion: `The pattern "${rule.pattern}" is not allowed in directories: ` +
                `${rule.notAllowedIn.join(', ')}. ` +
                (rule.allowedIn
                  ? `It is only allowed in: ${rule.allowedIn.join(', ')}.`
                  : 'Remove or refactor this code.'),
            });
          }
        }

        // Check allowedIn constraint (if pattern found outside allowed dirs)
        if (rule.allowedIn && rule.allowedIn.length > 0) {
          const isInAllowedDir = rule.allowedIn.some((dir) =>
            normalizedPath.includes(dir)
          );

          if (!isInAllowedDir) {
            violations.push({
              id: generateId(),
              rule: `custom:${rule.name}`,
              severity: rule.severity,
              message: `Custom rule "${rule.name}" violated: pattern "${rule.pattern}" found in ` +
                `"${filePath}" which is outside the allowed directories.`,
              filePath,
              lineStart: ctx.lineStart + i,
              lineEnd: ctx.lineStart + i,
              suggestion: `The pattern "${rule.pattern}" is only allowed in: ${rule.allowedIn.join(', ')}. ` +
                `Move this code to an appropriate location.`,
            });
          }
        }
      }
    }
  }

  return violations;
}

// ─── Layer Boundary Inference ─────────────────────────────────────

/**
 * Infer layer boundaries from architectural decisions.
 * Looks at structural decisions about layered/hexagonal/clean architecture
 * and builds boundary rules from them.
 */
function inferLayerBoundaries(decisions: ArchDecision[]): LayerBoundary[] {
  const boundaries: LayerBoundary[] = [];

  // Find architecture-related decisions
  const archDecisions = decisions.filter(
    (d) =>
      d.category === 'structural' &&
      d.status !== 'deprecated' &&
      (d.title.toLowerCase().includes('layer') ||
        d.title.toLowerCase().includes('architecture') ||
        d.title.toLowerCase().includes('hexagonal') ||
        d.title.toLowerCase().includes('clean') ||
        d.title.toLowerCase().includes('onion') ||
        d.description.toLowerCase().includes('layer') ||
        d.description.toLowerCase().includes('separation of concerns') ||
        d.tags.some((t) =>
          ['layered', 'hexagonal', 'clean-architecture', 'onion', 'ddd'].includes(
            t.toLowerCase()
          )
        ))
  );

  if (archDecisions.length === 0) {
    // No explicit layer decisions; use defaults if evidence suggests layered structure
    return buildDefaultLayerBoundaries(decisions);
  }

  for (const decision of archDecisions) {
    // Extract layer information from constraints
    for (const constraint of decision.constraints) {
      const layerMatch = constraint.match(
        /(\w+)\s+(?:layer|module)\s+(?:must not|should not|cannot)\s+(?:import|depend on|reference)\s+(\w+)/i
      );

      if (layerMatch) {
        const sourceLayerName = layerMatch[1].toLowerCase();
        const targetLayerName = layerMatch[2].toLowerCase();

        const existingBoundary = boundaries.find((b) => b.layer === sourceLayerName);
        if (existingBoundary) {
          if (!existingBoundary.forbiddenImports.includes(targetLayerName)) {
            existingBoundary.forbiddenImports.push(targetLayerName);
          }
        } else {
          boundaries.push({
            layer: sourceLayerName,
            patterns: WELL_KNOWN_LAYERS[sourceLayerName] || [sourceLayerName],
            forbiddenImports: [targetLayerName],
            decisionId: decision.id,
          });
        }
      }
    }

    // If no explicit constraints were parsed, infer from decision tags/title
    if (boundaries.length === 0) {
      const inferredBoundaries = inferFromDecisionMetadata(decision);
      boundaries.push(...inferredBoundaries);
    }
  }

  return boundaries;
}

/**
 * Build default layer boundaries by looking at evidence directories.
 */
function buildDefaultLayerBoundaries(decisions: ArchDecision[]): LayerBoundary[] {
  const boundaries: LayerBoundary[] = [];
  const foundLayers = new Set<string>();

  // Look at all evidence paths to detect layer directories
  for (const decision of decisions) {
    for (const evidence of decision.evidence) {
      const pathParts = evidence.filePath.split('/');
      for (const part of pathParts) {
        const lowerPart = part.toLowerCase();
        for (const [layerName, patterns] of Object.entries(WELL_KNOWN_LAYERS)) {
          if (patterns.some((p) => p === lowerPart)) {
            foundLayers.add(layerName);
          }
        }
      }
    }
  }

  // Build boundaries with default restrictions for found layers
  for (const layer of foundLayers) {
    const restrictions = DEFAULT_LAYER_RESTRICTIONS[layer] || [];
    const relevantRestrictions = restrictions.filter((r) => foundLayers.has(r));

    if (relevantRestrictions.length > 0) {
      boundaries.push({
        layer,
        patterns: WELL_KNOWN_LAYERS[layer] || [layer],
        forbiddenImports: relevantRestrictions,
        decisionId: '',
      });
    }
  }

  return boundaries;
}

/**
 * Infer layer boundaries from decision metadata (title, tags, description).
 */
function inferFromDecisionMetadata(decision: ArchDecision): LayerBoundary[] {
  const boundaries: LayerBoundary[] = [];
  const lowerTitle = decision.title.toLowerCase();
  const lowerDesc = decision.description.toLowerCase();

  // Check for layered/hexagonal/clean architecture mentions
  const isLayeredArch =
    lowerTitle.includes('layered') ||
    lowerTitle.includes('hexagonal') ||
    lowerTitle.includes('clean architecture') ||
    lowerTitle.includes('onion') ||
    lowerDesc.includes('layered') ||
    lowerDesc.includes('hexagonal') ||
    lowerDesc.includes('clean architecture');

  if (isLayeredArch) {
    // Apply standard layer restrictions
    for (const [layer, restrictions] of Object.entries(DEFAULT_LAYER_RESTRICTIONS)) {
      if (restrictions.length > 0) {
        boundaries.push({
          layer,
          patterns: WELL_KNOWN_LAYERS[layer] || [layer],
          forbiddenImports: restrictions,
          decisionId: decision.id,
        });
      }
    }
  }

  return boundaries;
}
