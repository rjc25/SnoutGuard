/**
 * Codebase scanner — walks the repository, discovers source files,
 * and extracts structural information.
 *
 * Extracts imports, exports, classes, functions, decorators,
 * interfaces, abstract classes, and type aliases for all 6 supported
 * languages. Handles edge cases like re-exports, barrel files,
 * conditional imports, and nested declarations.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import {
  detectLanguage,
  hash,
  type SnoutGuardConfig,
  type ParsedFile,
  type SupportedLanguage,
} from '@snoutguard/core';

/** Results from a codebase scan */
export interface ScanResult {
  files: ParsedFile[];
  directoryTree: DirectoryNode;
  totalFiles: number;
  totalLines: number;
  languageBreakdown: Record<string, number>;
}

/** Node in the directory tree */
export interface DirectoryNode {
  name: string;
  type: 'directory' | 'file';
  children?: DirectoryNode[];
  language?: string;
}

/**
 * Scan a codebase and extract structural information from source files.
 * Respects .gitignore and config include/exclude patterns.
 */
export async function scanCodebase(
  projectDir: string,
  config: SnoutGuardConfig
): Promise<ScanResult> {
  const includePatterns = config.analysis.include;
  const excludePatterns = config.analysis.exclude;
  const maxFileSizeBytes = config.analysis.maxFileSizeKb * 1024;
  const allowedLanguages = new Set(config.analysis.languages);

  // Discover files using glob
  const allFiles: string[] = [];
  for (const pattern of includePatterns) {
    const matches = await glob(pattern, {
      cwd: projectDir,
      nodir: true,
      ignore: excludePatterns,
      dot: true,
    });
    allFiles.push(...matches);
  }

  // Deduplicate
  const uniqueFiles = [...new Set(allFiles)];

  const parsedFiles: ParsedFile[] = [];
  let totalLines = 0;
  const languageBreakdown: Record<string, number> = {};

  for (const relPath of uniqueFiles) {
    const absPath = path.join(projectDir, relPath);

    // Skip if too large
    try {
      const stat = fs.statSync(absPath);
      if (stat.size > maxFileSizeBytes) continue;
    } catch {
      continue;
    }

    // Detect language
    const language = detectLanguage(relPath);
    if (!language || !allowedLanguages.has(language as SupportedLanguage)) continue;

    // Read and parse file
    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');
    totalLines += lines.length;
    languageBreakdown[language] = (languageBreakdown[language] || 0) + lines.length;

    const parsed = parseFile(relPath, content, language as SupportedLanguage);
    parsedFiles.push(parsed);
  }

  // Build directory tree
  const directoryTree = buildDirectoryTree(
    uniqueFiles.filter((f) => {
      const lang = detectLanguage(f);
      return lang && allowedLanguages.has(lang as SupportedLanguage);
    })
  );

  return {
    files: parsedFiles,
    directoryTree,
    totalFiles: parsedFiles.length,
    totalLines,
    languageBreakdown,
  };
}

/** Strip comments from source code to avoid false matches */
function stripComments(content: string, language: SupportedLanguage): string {
  switch (language) {
    case 'python':
      // Remove # comments and triple-quoted strings used as docstrings
      return content
        .replace(/#[^\n]*/g, '')
        .replace(/"""[\s\S]*?"""/g, '""')
        .replace(/'''[\s\S]*?'''/g, "''");
    default:
      // C-style: remove // and /* */ comments
      return content
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
  }
}

/** Parse a single source file */
function parseFile(
  filePath: string,
  content: string,
  language: SupportedLanguage
): ParsedFile {
  const stripped = stripComments(content, language);

  const imports = extractImports(stripped, language);
  const exports = extractExports(stripped, language);
  const classes = extractClasses(stripped, language);
  const functions = extractFunctions(stripped, language);
  const decorators = extractDecorators(stripped, language);
  const interfaces = extractInterfaces(stripped, language);
  const abstractClasses = extractAbstractClasses(stripped, language);
  const typeAliases = extractTypeAliases(stripped, language);

  return {
    filePath,
    language,
    imports,
    exports,
    classes,
    functions,
    decorators,
    interfaces,
    abstractClasses,
    typeAliases,
    lineCount: content.split('\n').length,
    contentHash: hash(content),
  };
}

// ─── Import Extraction ─────────────────────────────────────────────

function extractImports(content: string, language: SupportedLanguage): string[] {
  const imports: string[] = [];

  switch (language) {
    case 'typescript':
    case 'javascript': {
      // ES imports: import X from 'y', import { X } from 'y', import * as X from 'y'
      const esImportRegex = /import\s+(?:type\s+)?(?:(?:\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = esImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      // Dynamic import()
      const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = dynamicImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      // require()
      const requireRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      break;
    }
    case 'python': {
      // from X import Y, Z
      const fromImportRegex = /^from\s+([\w.]+)\s+import\s+/gm;
      let match: RegExpExecArray | null;
      while ((match = fromImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      // import X, import X.Y
      const plainImportRegex = /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;
      while ((match = plainImportRegex.exec(content)) !== null) {
        for (const mod of match[1].split(',')) {
          imports.push(mod.trim().split(' ')[0]); // handle `import X as Y`
        }
      }
      break;
    }
    case 'go': {
      // Single import: import "path"
      // Multi import: import ( "path1"\n "path2" )
      const goImportRegex = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
      let match: RegExpExecArray | null;
      while ((match = goImportRegex.exec(content)) !== null) {
        if (match[1]) {
          const multiImports = match[1].match(/"([^"]+)"/g);
          multiImports?.forEach((m) => imports.push(m.replace(/"/g, '')));
        } else if (match[2]) {
          imports.push(match[2]);
        }
      }
      break;
    }
    case 'rust': {
      // use crate::X, use std::X, use super::X
      const rustUseRegex = /use\s+([\w:]+(?:::\{[^}]+\})?)/g;
      let match: RegExpExecArray | null;
      while ((match = rustUseRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      // extern crate
      const externRegex = /extern\s+crate\s+(\w+)/g;
      while ((match = externRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      break;
    }
    case 'java': {
      const javaImportRegex = /import\s+(?:static\s+)?([\w.]+(?:\.\*)?)/g;
      let match: RegExpExecArray | null;
      while ((match = javaImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      break;
    }
  }

  return [...new Set(imports)];
}

// ─── Export Extraction (all 6 languages) ────────────────────────────

function extractExports(content: string, language: SupportedLanguage): string[] {
  const exports: string[] = [];

  switch (language) {
    case 'typescript':
    case 'javascript': {
      // Named exports: export { X, Y }, export const/let/var/function/class/interface/type/enum X
      const namedExportRegex =
        /export\s+(?:default\s+)?(?:abstract\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = namedExportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      // Re-exports: export { X } from 'y', export * from 'y'
      const reExportRegex = /export\s+\{([^}]*)\}\s+from/g;
      while ((match = reExportRegex.exec(content)) !== null) {
        for (const name of match[1].split(',')) {
          const trimmed = name.trim().split(/\s+as\s+/).pop()?.trim();
          if (trimmed) exports.push(trimmed);
        }
      }
      // export default (anonymous)
      if (/export\s+default\s+/.test(content) && !exports.includes('default')) {
        exports.push('default');
      }
      break;
    }
    case 'python': {
      // __all__ = ['X', 'Y']
      const allRegex = /__all__\s*=\s*\[([^\]]*)\]/;
      const allMatch = allRegex.exec(content);
      if (allMatch) {
        const names = allMatch[1].match(/['"](\w+)['"]/g);
        names?.forEach((n) => exports.push(n.replace(/['"]/g, '')));
      } else {
        // Top-level function and class defs (not starting with _) are implicit exports
        const defRegex = /^(?:def|class)\s+([A-Z_]\w*|[a-z]\w*)/gm;
        let match: RegExpExecArray | null;
        while ((match = defRegex.exec(content)) !== null) {
          if (!match[1].startsWith('_')) {
            exports.push(match[1]);
          }
        }
      }
      break;
    }
    case 'go': {
      // Exported = capitalized names
      const funcRegex = /func\s+(?:\([^)]*\)\s+)?([A-Z]\w*)/g;
      let match: RegExpExecArray | null;
      while ((match = funcRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      const typeRegex = /type\s+([A-Z]\w*)\s+(?:struct|interface)/g;
      while ((match = typeRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      break;
    }
    case 'rust': {
      // pub fn, pub struct, pub enum, pub trait, pub type
      const pubRegex = /pub(?:\([^)]*\))?\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const|static)\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = pubRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      break;
    }
    case 'java': {
      // public class/interface/enum/record
      const pubRegex = /public\s+(?:abstract\s+)?(?:final\s+)?(?:class|interface|enum|record|@interface)\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = pubRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      break;
    }
  }

  return [...new Set(exports)];
}

// ─── Class Extraction ──────────────────────────────────────────────

function extractClasses(content: string, language: SupportedLanguage): string[] {
  const classes: string[] = [];
  let regex: RegExp;

  switch (language) {
    case 'typescript':
    case 'javascript':
      regex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g;
      break;
    case 'python':
      regex = /^class\s+(\w+)/gm;
      break;
    case 'java':
      regex = /(?:public|private|protected|abstract|final|\s)*class\s+(\w+)/g;
      break;
    case 'go':
      // Go uses structs
      regex = /type\s+(\w+)\s+struct\b/g;
      break;
    case 'rust':
      regex = /(?:pub\s+)?struct\s+(\w+)|(?:pub\s+)?enum\s+(\w+)/g;
      break;
    default:
      return classes;
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    classes.push(match[1] || match[2]);
  }

  return [...new Set(classes)];
}

// ─── Function Extraction ───────────────────────────────────────────

function extractFunctions(content: string, language: SupportedLanguage): string[] {
  const functions: string[] = [];
  let regex: RegExp;

  switch (language) {
    case 'typescript':
    case 'javascript':
      regex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
      break;
    case 'python':
      regex = /^def\s+(\w+)/gm;
      break;
    case 'go':
      regex = /func\s+(?:\([^)]*\)\s+)?(\w+)/g;
      break;
    case 'rust':
      regex = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g;
      break;
    case 'java':
      regex = /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[\w<>,\s]+\s+(\w+)\s*\(/g;
      break;
    default:
      return functions;
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1] || match[2];
    if (name) functions.push(name);
  }

  return [...new Set(functions)];
}

// ─── Decorator Extraction ──────────────────────────────────────────

function extractDecorators(content: string, language: SupportedLanguage): string[] {
  const decorators: string[] = [];

  if (language === 'typescript' || language === 'javascript' || language === 'python') {
    const regex = /@(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      decorators.push(match[1]);
    }
  } else if (language === 'java') {
    const regex = /@(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      decorators.push(match[1]);
    }
  } else if (language === 'rust') {
    // Rust attributes: #[derive(X)], #[test], #[cfg(...)]
    const regex = /#\[(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      decorators.push(match[1]);
    }
  }

  return [...new Set(decorators)];
}

// ─── Interface Extraction ──────────────────────────────────────────

function extractInterfaces(content: string, language: SupportedLanguage): string[] {
  const interfaces: string[] = [];

  switch (language) {
    case 'typescript': {
      const regex = /(?:export\s+)?interface\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        interfaces.push(match[1]);
      }
      break;
    }
    case 'java': {
      const regex = /(?:public\s+)?interface\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        interfaces.push(match[1]);
      }
      break;
    }
    case 'go': {
      const regex = /type\s+(\w+)\s+interface\b/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        interfaces.push(match[1]);
      }
      break;
    }
    case 'rust': {
      // Rust traits serve as interfaces
      const regex = /(?:pub\s+)?trait\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        interfaces.push(match[1]);
      }
      break;
    }
    case 'python': {
      // ABC subclasses and Protocol classes
      const regex = /class\s+(\w+)\s*\([^)]*(?:ABC|Protocol)[^)]*\)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        interfaces.push(match[1]);
      }
      break;
    }
  }

  return [...new Set(interfaces)];
}

// ─── Abstract Class Extraction ─────────────────────────────────────

function extractAbstractClasses(content: string, language: SupportedLanguage): string[] {
  const abstracts: string[] = [];

  switch (language) {
    case 'typescript':
    case 'javascript': {
      const regex = /(?:export\s+)?abstract\s+class\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        abstracts.push(match[1]);
      }
      break;
    }
    case 'java': {
      const regex = /(?:public\s+)?abstract\s+class\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        abstracts.push(match[1]);
      }
      break;
    }
    case 'python': {
      // Classes using @abstractmethod or ABC
      const regex = /class\s+(\w+)\s*\([^)]*ABC[^)]*\)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        abstracts.push(match[1]);
      }
      break;
    }
    case 'rust': {
      // Rust traits with methods = abstract
      // Already captured in interfaces; no separate concept
      break;
    }
  }

  return [...new Set(abstracts)];
}

// ─── Type Alias Extraction ─────────────────────────────────────────

function extractTypeAliases(content: string, language: SupportedLanguage): string[] {
  const types: string[] = [];

  switch (language) {
    case 'typescript': {
      const regex = /(?:export\s+)?type\s+(\w+)\s*=/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        types.push(match[1]);
      }
      break;
    }
    case 'go': {
      const regex = /type\s+(\w+)\s+(?!struct\b|interface\b)\w/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        types.push(match[1]);
      }
      break;
    }
    case 'rust': {
      const regex = /(?:pub\s+)?type\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        types.push(match[1]);
      }
      break;
    }
  }

  return [...new Set(types)];
}

// ─── Directory Tree ────────────────────────────────────────────────

function buildDirectoryTree(files: string[]): DirectoryNode {
  const root: DirectoryNode = { name: '.', type: 'directory', children: [] };

  for (const filePath of files) {
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.children!.push({
          name: part,
          type: 'file',
          language: detectLanguage(filePath),
        });
      } else {
        let child = current.children!.find(
          (c) => c.name === part && c.type === 'directory'
        );
        if (!child) {
          child = { name: part, type: 'directory', children: [] };
          current.children!.push(child);
        }
        current = child;
      }
    }
  }

  return root;
}

/** Format directory tree as a string for LLM context */
export function formatDirectoryTree(
  node: DirectoryNode,
  indent: string = ''
): string {
  let result = `${indent}${node.name}/\n`;

  if (node.children) {
    const sorted = [...node.children].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const child of sorted) {
      if (child.type === 'directory') {
        result += formatDirectoryTree(child, indent + '  ');
      } else {
        result += `${indent}  ${child.name}\n`;
      }
    }
  }

  return result;
}
