/**
 * Handlebars template helpers and base templates for context file generation.
 * Provides shared formatting utilities used across all generators.
 */

import Handlebars from 'handlebars';
import type { ArchDecision, ArchCategory } from '@archguard/core';

// ─── Handlebars Helpers ───────────────────────────────────────────

/** Register all custom Handlebars helpers */
export function registerHelpers(): typeof Handlebars {
  Handlebars.registerHelper('uppercase', (str: string) => {
    return str?.toUpperCase() ?? '';
  });

  Handlebars.registerHelper('capitalize', (str: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  Handlebars.registerHelper('dashToSpace', (str: string) => {
    return str?.replace(/-/g, ' ') ?? '';
  });

  Handlebars.registerHelper('indent', (str: string, spaces: number) => {
    if (!str) return '';
    const pad = ' '.repeat(typeof spaces === 'number' ? spaces : 2);
    return str
      .split('\n')
      .map((line) => pad + line)
      .join('\n');
  });

  Handlebars.registerHelper('bulletList', (items: string[]) => {
    if (!items || items.length === 0) return 'None';
    return items.map((item) => `- ${item}`).join('\n');
  });

  Handlebars.registerHelper('numberedList', (items: string[]) => {
    if (!items || items.length === 0) return 'None';
    return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
  });

  Handlebars.registerHelper('confidenceLabel', (confidence: number) => {
    if (confidence >= 0.9) return 'Very High';
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.5) return 'Medium';
    if (confidence >= 0.3) return 'Low';
    return 'Very Low';
  });

  Handlebars.registerHelper('confidenceBar', (confidence: number) => {
    const filled = Math.round(confidence * 10);
    const empty = 10 - filled;
    return '[' + '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + ']';
  });

  Handlebars.registerHelper('statusIcon', (status: string) => {
    switch (status) {
      case 'confirmed':
        return '[CONFIRMED]';
      case 'detected':
        return '[DETECTED]';
      case 'deprecated':
        return '[DEPRECATED]';
      case 'custom':
        return '[CUSTOM]';
      default:
        return `[${status?.toUpperCase() ?? 'UNKNOWN'}]`;
    }
  });

  Handlebars.registerHelper('categoryLabel', (category: ArchCategory) => {
    const labels: Record<ArchCategory, string> = {
      structural: 'Structural Architecture',
      behavioral: 'Behavioral Patterns',
      deployment: 'Deployment & Infrastructure',
      data: 'Data Architecture',
      api: 'API Design',
      testing: 'Testing Strategy',
      security: 'Security Architecture',
    };
    return labels[category] ?? category;
  });

  Handlebars.registerHelper('ifEquals', function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: Handlebars.HelperOptions
  ) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('ifNotEmpty', function (
    this: unknown,
    arr: unknown[],
    options: Handlebars.HelperOptions
  ) {
    return arr && arr.length > 0 ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('join', (items: string[], separator: string) => {
    if (!items) return '';
    const sep = typeof separator === 'string' ? separator : ', ';
    return items.join(sep);
  });

  Handlebars.registerHelper('tagBadges', (tags: string[]) => {
    if (!tags || tags.length === 0) return '';
    return tags.map((tag) => `[${tag}]`).join(' ');
  });

  return Handlebars;
}

// ─── Decision Grouping Utilities ──────────────────────────────────

/** Group decisions by category */
export function groupByCategory(
  decisions: ArchDecision[]
): Record<ArchCategory, ArchDecision[]> {
  const groups: Record<string, ArchDecision[]> = {};
  for (const decision of decisions) {
    if (!groups[decision.category]) {
      groups[decision.category] = [];
    }
    groups[decision.category].push(decision);
  }
  return groups as Record<ArchCategory, ArchDecision[]>;
}

/** Group decisions by status */
export function groupByStatus(
  decisions: ArchDecision[]
): Record<string, ArchDecision[]> {
  const groups: Record<string, ArchDecision[]> = {};
  for (const decision of decisions) {
    if (!groups[decision.status]) {
      groups[decision.status] = [];
    }
    groups[decision.status].push(decision);
  }
  return groups;
}

/** Get all unique tags from decisions */
export function getAllTags(decisions: ArchDecision[]): string[] {
  const tags = new Set<string>();
  for (const decision of decisions) {
    for (const tag of decision.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
}

/** Get all unique constraints from decisions */
export function getAllConstraints(decisions: ArchDecision[]): string[] {
  const constraints = new Set<string>();
  for (const decision of decisions) {
    for (const constraint of decision.constraints) {
      constraints.add(constraint);
    }
  }
  return Array.from(constraints).sort();
}

/** Filter decisions to only active ones (not deprecated) */
export function activeDecisions(decisions: ArchDecision[]): ArchDecision[] {
  return decisions.filter((d) => d.status !== 'deprecated');
}

/** Sort decisions by confidence (highest first) */
export function sortByConfidence(decisions: ArchDecision[]): ArchDecision[] {
  return [...decisions].sort((a, b) => b.confidence - a.confidence);
}

/** Compile a Handlebars template string */
export function compileTemplate(templateStr: string): HandlebarsTemplateDelegate {
  registerHelpers();
  return Handlebars.compile(templateStr);
}

// ─── User Section Preservation ────────────────────────────────────

const USER_SECTION_START = '<!-- archguard:user-start -->';
const USER_SECTION_END = '<!-- archguard:user-end -->';

/** Extract user sections from existing content */
export function extractUserSections(content: string): string | null {
  const startIdx = content.indexOf(USER_SECTION_START);
  const endIdx = content.indexOf(USER_SECTION_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }

  return content.slice(
    startIdx + USER_SECTION_START.length,
    endIdx
  );
}

/** Insert user sections into generated content (at the end, before any closing) */
export function insertUserSections(
  generatedContent: string,
  userContent: string | null
): string {
  if (!userContent) {
    return (
      generatedContent +
      '\n\n' +
      USER_SECTION_START +
      '\n' +
      USER_SECTION_END +
      '\n'
    );
  }

  return (
    generatedContent +
    '\n\n' +
    USER_SECTION_START +
    userContent +
    USER_SECTION_END +
    '\n'
  );
}

/** Format a generation timestamp header */
export function generationHeader(format: string): string {
  const timestamp = new Date().toISOString();
  return `# Generated by ArchGuard (${format}) on ${timestamp}`;
}
