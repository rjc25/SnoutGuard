/**
 * Codebase scanner - walks the repository, discovers source files,
 * and extracts structural information via regex-based parsing.
 * Falls back gracefully when tree-sitter grammars aren't available.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import {
  detectLanguage,
  hash,
  type ArchGuardConfig,
  type ParsedFile,
  type SupportedLanguage,
} from '@archguard/core';

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
  config: ArchGuardConfig
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
      dot: false,
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

/** Parse a single source file using regex-based extraction */
function parseFile(
  filePath: string,
  content: string,
  language: SupportedLanguage
): ParsedFile {
  const imports = extractImports(content, language);
  const exports = extractExports(content, language);
  const classes = extractClasses(content, language);
  const functions = extractFunctions(content, language);
  const decorators = extractDecorators(content, language);

  return {
    filePath,
    language,
    imports,
    exports,
    classes,
    functions,
    decorators,
    lineCount: content.split('\n').length,
    contentHash: hash(content),
  };
}

/** Extract import statements from source code */
function extractImports(content: string, language: SupportedLanguage): string[] {
  const imports: string[] = [];

  switch (language) {
    case 'typescript':
    case 'javascript': {
      // ES imports
      const esImportRegex = /import\s+(?:(?:\{[^}]*\}|[\w*]+)\s+from\s+)?['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = esImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      // require
      const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      break;
    }
    case 'python': {
      const pyImportRegex = /^(?:from\s+([\w.]+)\s+)?import\s+([\w.,\s]+)/gm;
      let match: RegExpExecArray | null;
      while ((match = pyImportRegex.exec(content)) !== null) {
        imports.push(match[1] || match[2].split(',')[0].trim());
      }
      break;
    }
    case 'go': {
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
      const rustUseRegex = /use\s+([\w:]+(?:::\{[^}]+\})?)/g;
      let match: RegExpExecArray | null;
      while ((match = rustUseRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      break;
    }
    case 'java': {
      const javaImportRegex = /import\s+(?:static\s+)?([\w.]+)/g;
      let match: RegExpExecArray | null;
      while ((match = javaImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      break;
    }
  }

  return imports;
}

/** Extract export declarations from source code */
function extractExports(content: string, language: SupportedLanguage): string[] {
  const exports: string[] = [];

  if (language === 'typescript' || language === 'javascript') {
    const exportRegex =
      /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
  }

  return exports;
}

/** Extract class declarations from source code */
function extractClasses(content: string, language: SupportedLanguage): string[] {
  const classes: string[] = [];
  let regex: RegExp;

  switch (language) {
    case 'typescript':
    case 'javascript':
      regex = /class\s+(\w+)/g;
      break;
    case 'python':
      regex = /class\s+(\w+)/g;
      break;
    case 'java':
      regex = /(?:public|private|protected)?\s*class\s+(\w+)/g;
      break;
    case 'rust':
      regex = /struct\s+(\w+)|enum\s+(\w+)/g;
      break;
    default:
      return classes;
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    classes.push(match[1] || match[2]);
  }

  return classes;
}

/** Extract function declarations from source code */
function extractFunctions(content: string, language: SupportedLanguage): string[] {
  const functions: string[] = [];
  let regex: RegExp;

  switch (language) {
    case 'typescript':
    case 'javascript':
      regex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g;
      break;
    case 'python':
      regex = /def\s+(\w+)/g;
      break;
    case 'go':
      regex = /func\s+(?:\([^)]*\)\s+)?(\w+)/g;
      break;
    case 'rust':
      regex = /fn\s+(\w+)/g;
      break;
    case 'java':
      regex = /(?:public|private|protected)?\s*(?:static\s+)?[\w<>,\s]+\s+(\w+)\s*\(/g;
      break;
    default:
      return functions;
  }

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    functions.push(match[1] || match[2]);
  }

  return functions;
}

/** Extract decorator/annotation usage from source code */
function extractDecorators(content: string, language: SupportedLanguage): string[] {
  const decorators: string[] = [];

  if (
    language === 'typescript' ||
    language === 'javascript' ||
    language === 'python'
  ) {
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
  }

  return [...new Set(decorators)];
}

/** Build a directory tree from file paths */
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
