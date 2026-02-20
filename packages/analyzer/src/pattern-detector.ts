/**
 * Heuristic pattern detector.
 * Identifies common architectural patterns from code structure,
 * directory conventions, and import/export patterns.
 */

import type { ParsedFile, DetectedPattern, Evidence } from '@archguard/core';
import type { DirectoryNode } from './scanner.js';

/** Detect architectural patterns using heuristics */
export function detectPatterns(
  files: ParsedFile[],
  directoryTree: DirectoryNode
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  patterns.push(...detectMvcPattern(files));
  patterns.push(...detectRepositoryPattern(files));
  patterns.push(...detectDependencyInjection(files));
  patterns.push(...detectEventDrivenPattern(files));
  patterns.push(...detectMiddlewarePattern(files));
  patterns.push(...detectApiVersioning(files));
  patterns.push(...detectStateManagement(files));
  patterns.push(...detectLayeredArchitecture(files, directoryTree));
  patterns.push(...detectCleanArchitecture(files, directoryTree));

  return patterns.filter((p) => p.confidence > 0.3);
}

/** Detect MVC / MVVM patterns */
function detectMvcPattern(files: ParsedFile[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const controllers = files.filter(
    (f) =>
      f.filePath.includes('/controller') ||
      f.filePath.includes('/controllers/') ||
      f.classes.some((c) => c.toLowerCase().includes('controller')) ||
      f.decorators.includes('Controller')
  );

  const models = files.filter(
    (f) =>
      f.filePath.includes('/model') ||
      f.filePath.includes('/models/') ||
      f.classes.some((c) => c.toLowerCase().includes('model'))
  );

  const views = files.filter(
    (f) =>
      f.filePath.includes('/view') ||
      f.filePath.includes('/views/') ||
      f.filePath.includes('/components/') ||
      f.filePath.includes('/pages/')
  );

  if (controllers.length > 0 && models.length > 0) {
    const evidence: Evidence[] = controllers.slice(0, 3).map((f) => ({
      filePath: f.filePath,
      lineRange: [1, Math.min(10, f.lineCount)] as [number, number],
      snippet: `// Controller file: ${f.filePath}`,
      explanation: 'File follows controller naming convention',
    }));

    const isViewPresent = views.length > 0;
    const confidence = Math.min(
      0.9,
      (controllers.length + models.length + (isViewPresent ? views.length : 0)) /
        files.length *
        5
    );

    patterns.push({
      name: isViewPresent ? 'MVC (Model-View-Controller)' : 'MC (Model-Controller)',
      confidence,
      evidence,
      description: `Detected ${controllers.length} controllers, ${models.length} models${isViewPresent ? `, ${views.length} views` : ''}`,
    });
  }

  return patterns;
}

/** Detect repository pattern */
function detectRepositoryPattern(files: ParsedFile[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const repos = files.filter(
    (f) =>
      f.filePath.includes('/repositor') ||
      f.classes.some((c) => c.toLowerCase().includes('repository')) ||
      f.exports.some((e) => e.toLowerCase().includes('repository'))
  );

  if (repos.length >= 2) {
    const evidence: Evidence[] = repos.slice(0, 3).map((f) => ({
      filePath: f.filePath,
      lineRange: [1, Math.min(10, f.lineCount)] as [number, number],
      snippet: `// Repository: ${f.classes.find((c) => c.toLowerCase().includes('repository')) || f.filePath}`,
      explanation: 'File implements repository pattern',
    }));

    patterns.push({
      name: 'Repository Pattern',
      confidence: Math.min(0.9, repos.length / 5),
      evidence,
      description: `Found ${repos.length} repository implementations abstracting data access`,
    });
  }

  return patterns;
}

/** Detect dependency injection patterns */
function detectDependencyInjection(files: ParsedFile[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const diFiles = files.filter(
    (f) =>
      f.decorators.some((d) =>
        ['Injectable', 'Inject', 'Component', 'Service', 'Module'].includes(d)
      ) ||
      f.imports.some(
        (i) =>
          i.includes('inversify') ||
          i.includes('tsyringe') ||
          i.includes('@nestjs')
      )
  );

  if (diFiles.length >= 2) {
    const evidence: Evidence[] = diFiles.slice(0, 3).map((f) => ({
      filePath: f.filePath,
      lineRange: [1, Math.min(10, f.lineCount)] as [number, number],
      snippet: `// DI decorators: ${f.decorators.filter((d) => ['Injectable', 'Inject', 'Component', 'Service', 'Module'].includes(d)).join(', ')}`,
      explanation: 'File uses dependency injection decorators',
    }));

    patterns.push({
      name: 'Dependency Injection',
      confidence: Math.min(0.95, diFiles.length / 10 + 0.5),
      evidence,
      description: `Found ${diFiles.length} files using dependency injection patterns`,
    });
  }

  return patterns;
}

/** Detect event-driven patterns */
function detectEventDrivenPattern(files: ParsedFile[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const eventFiles = files.filter(
    (f) =>
      f.imports.some(
        (i) =>
          i.includes('eventemitter') ||
          i.includes('events') ||
          i.includes('pubsub') ||
          i.includes('kafka') ||
          i.includes('rabbitmq') ||
          i.includes('amqp')
      ) ||
      f.functions.some(
        (fn) =>
          fn.includes('emit') ||
          fn.includes('publish') ||
          fn.includes('subscribe') ||
          fn.includes('onEvent') ||
          fn.includes('handleEvent')
      ) ||
      f.decorators.some((d) =>
        ['EventHandler', 'OnEvent', 'Subscribe'].includes(d)
      )
  );

  if (eventFiles.length >= 2) {
    const evidence: Evidence[] = eventFiles.slice(0, 3).map((f) => ({
      filePath: f.filePath,
      lineRange: [1, Math.min(10, f.lineCount)] as [number, number],
      snippet: `// Event-driven patterns in: ${f.filePath}`,
      explanation: 'File uses event-driven communication patterns',
    }));

    patterns.push({
      name: 'Event-Driven Architecture',
      confidence: Math.min(0.85, eventFiles.length / 8 + 0.3),
      evidence,
      description: `Found ${eventFiles.length} files using event-driven patterns (emitters, pub/sub)`,
    });
  }

  return patterns;
}

/** Detect middleware chain patterns */
function detectMiddlewarePattern(files: ParsedFile[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const middlewareFiles = files.filter(
    (f) =>
      f.filePath.includes('/middleware') ||
      f.classes.some((c) => c.toLowerCase().includes('middleware')) ||
      f.exports.some((e) => e.toLowerCase().includes('middleware')) ||
      f.imports.some(
        (i) => i.includes('express') || i.includes('koa') || i.includes('hono')
      )
  );

  if (middlewareFiles.length >= 2) {
    const evidence: Evidence[] = middlewareFiles.slice(0, 3).map((f) => ({
      filePath: f.filePath,
      lineRange: [1, Math.min(10, f.lineCount)] as [number, number],
      snippet: `// Middleware: ${f.filePath}`,
      explanation: 'File implements middleware pattern',
    }));

    patterns.push({
      name: 'Middleware Chain',
      confidence: Math.min(0.85, middlewareFiles.length / 6 + 0.4),
      evidence,
      description: `Found ${middlewareFiles.length} middleware implementations`,
    });
  }

  return patterns;
}

/** Detect API versioning strategies */
function detectApiVersioning(files: ParsedFile[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const versionedFiles = files.filter(
    (f) =>
      /\/v\d+\//.test(f.filePath) ||
      /\/api\/v\d+/.test(f.filePath) ||
      f.filePath.includes('/versions/')
  );

  if (versionedFiles.length >= 2) {
    const versions = new Set<string>();
    for (const f of versionedFiles) {
      const match = f.filePath.match(/\/v(\d+)\//);
      if (match) versions.add(match[1]);
    }

    const evidence: Evidence[] = versionedFiles.slice(0, 3).map((f) => ({
      filePath: f.filePath,
      lineRange: [1, 1] as [number, number],
      snippet: `// Versioned path: ${f.filePath}`,
      explanation: 'File follows URL-based API versioning convention',
    }));

    patterns.push({
      name: 'API Versioning (URL-based)',
      confidence: Math.min(0.9, versions.size * 0.3 + 0.3),
      evidence,
      description: `Found ${versions.size} API version(s) across ${versionedFiles.length} files`,
    });
  }

  return patterns;
}

/** Detect state management patterns */
function detectStateManagement(files: ParsedFile[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Redux
  const reduxFiles = files.filter(
    (f) =>
      f.imports.some(
        (i) =>
          i.includes('redux') ||
          i.includes('@reduxjs') ||
          i.includes('react-redux')
      ) ||
      f.functions.some(
        (fn) =>
          fn.includes('Reducer') ||
          fn.includes('useSelector') ||
          fn.includes('useDispatch')
      )
  );

  if (reduxFiles.length >= 2) {
    patterns.push({
      name: 'Redux State Management',
      confidence: Math.min(0.9, reduxFiles.length / 10 + 0.5),
      evidence: reduxFiles.slice(0, 3).map((f) => ({
        filePath: f.filePath,
        lineRange: [1, 1] as [number, number],
        snippet: `// Redux usage: ${f.filePath}`,
        explanation: 'File uses Redux for state management',
      })),
      description: `Found ${reduxFiles.length} files using Redux`,
    });
  }

  // Zustand
  const zustandFiles = files.filter((f) =>
    f.imports.some((i) => i.includes('zustand'))
  );

  if (zustandFiles.length >= 1) {
    patterns.push({
      name: 'Zustand State Management',
      confidence: Math.min(0.9, zustandFiles.length / 5 + 0.5),
      evidence: zustandFiles.slice(0, 3).map((f) => ({
        filePath: f.filePath,
        lineRange: [1, 1] as [number, number],
        snippet: `// Zustand store: ${f.filePath}`,
        explanation: 'File uses Zustand for state management',
      })),
      description: `Found ${zustandFiles.length} files using Zustand`,
    });
  }

  return patterns;
}

/** Detect layered architecture from directory structure */
function detectLayeredArchitecture(
  files: ParsedFile[],
  _tree: DirectoryNode
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const layers = {
    presentation: files.filter(
      (f) =>
        f.filePath.includes('/presentation/') ||
        f.filePath.includes('/ui/') ||
        f.filePath.includes('/pages/') ||
        f.filePath.includes('/components/')
    ),
    application: files.filter(
      (f) =>
        f.filePath.includes('/application/') ||
        f.filePath.includes('/services/') ||
        f.filePath.includes('/use-cases/')
    ),
    domain: files.filter(
      (f) =>
        f.filePath.includes('/domain/') ||
        f.filePath.includes('/entities/') ||
        f.filePath.includes('/models/')
    ),
    infrastructure: files.filter(
      (f) =>
        f.filePath.includes('/infrastructure/') ||
        f.filePath.includes('/repositories/') ||
        f.filePath.includes('/adapters/')
    ),
  };

  const activeLayers = Object.entries(layers).filter(
    ([, layerFiles]) => layerFiles.length > 0
  );

  if (activeLayers.length >= 3) {
    const evidence: Evidence[] = activeLayers.slice(0, 4).map(([name, layerFiles]) => ({
      filePath: layerFiles[0].filePath,
      lineRange: [1, 1] as [number, number],
      snippet: `// ${name} layer: ${layerFiles.length} files`,
      explanation: `Part of the ${name} architectural layer`,
    }));

    patterns.push({
      name: 'Layered Architecture',
      confidence: Math.min(0.9, activeLayers.length * 0.2 + 0.2),
      evidence,
      description: `Detected ${activeLayers.length} architectural layers: ${activeLayers.map(([n]) => n).join(', ')}`,
    });
  }

  return patterns;
}

/** Detect clean architecture */
function detectCleanArchitecture(
  files: ParsedFile[],
  _tree: DirectoryNode
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const hasUseCases = files.some(
    (f) =>
      f.filePath.includes('/use-cases/') ||
      f.filePath.includes('/usecases/') ||
      f.classes.some((c) => c.includes('UseCase'))
  );

  const hasEntities = files.some(
    (f) =>
      f.filePath.includes('/entities/') || f.filePath.includes('/domain/')
  );

  const hasPorts = files.some(
    (f) =>
      f.filePath.includes('/ports/') || f.filePath.includes('/interfaces/')
  );

  const hasAdapters = files.some(
    (f) =>
      f.filePath.includes('/adapters/') ||
      f.filePath.includes('/infrastructure/')
  );

  const matches = [hasUseCases, hasEntities, hasPorts, hasAdapters].filter(
    Boolean
  ).length;

  if (matches >= 3) {
    patterns.push({
      name: 'Clean Architecture',
      confidence: Math.min(0.9, matches * 0.2 + 0.2),
      evidence: [
        {
          filePath: '.',
          lineRange: [1, 1] as [number, number],
          snippet: '// Clean Architecture structure detected',
          explanation: `Found ${matches}/4 clean architecture components (use-cases, entities, ports, adapters)`,
        },
      ],
      description: `Detected clean architecture with ${matches}/4 components`,
    });
  }

  return patterns;
}
