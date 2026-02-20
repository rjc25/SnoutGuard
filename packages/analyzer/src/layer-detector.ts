/**
 * Layer violation detection.
 *
 * Infers architectural layers from directory structure and configured
 * layer definitions, then checks every import in the dependency graph
 * against the layer hierarchy to find violations.
 *
 * Default layer hierarchy (configurable in .archguard.yml):
 *   presentation -> application -> domain <- infrastructure
 */

import { minimatch } from 'minimatch';
import type { ParsedFile, LayerDefinition, LayerViolation } from '@archguard/core';
import type { DependencyGraph } from './dependency-mapper.js';

/**
 * Detect layer violations in the dependency graph.
 *
 * For each import edge, determines which layer the source and target
 * files belong to, then checks if that dependency is allowed by the
 * layer definitions.
 *
 * @param graph - The dependency graph to analyze
 * @param files - Parsed files with metadata
 * @param layers - Layer definitions from config
 * @returns Array of layer violations found
 */
export function detectLayerViolations(
  graph: DependencyGraph,
  files: ParsedFile[],
  layers: LayerDefinition[]
): LayerViolation[] {
  if (layers.length === 0) return [];

  const violations: LayerViolation[] = [];

  // Build a cache of file -> layer mappings
  const fileLayerCache = new Map<string, string | null>();

  function getLayer(filePath: string): string | null {
    if (fileLayerCache.has(filePath)) return fileLayerCache.get(filePath)!;

    for (const layer of layers) {
      for (const pattern of layer.patterns) {
        if (minimatch(filePath, pattern, { dot: true })) {
          fileLayerCache.set(filePath, layer.name);
          return layer.name;
        }
      }
    }

    fileLayerCache.set(filePath, null);
    return null;
  }

  // Build a lookup for allowed dependencies per layer
  const allowedDeps = new Map<string, Set<string>>();
  for (const layer of layers) {
    allowedDeps.set(layer.name, new Set(layer.allowedDependencies));
  }

  // Check every edge in the dependency graph
  for (const [filePath, node] of graph.nodes) {
    const sourceLayer = getLayer(filePath);
    if (!sourceLayer) continue; // File not in any defined layer

    for (const target of node.imports) {
      const targetLayer = getLayer(target);
      if (!targetLayer) continue; // Target not in any defined layer
      if (sourceLayer === targetLayer) continue; // Same layer is always fine

      const allowed = allowedDeps.get(sourceLayer);
      if (allowed && !allowed.has(targetLayer)) {
        // Find the import statement for context
        const sourceFile = files.find((f) => f.filePath === filePath);
        const importStatement = sourceFile
          ? sourceFile.imports.find((imp) => {
              // Try to match the import to the target file
              return target.includes(imp.replace(/^\.\/|^\.\.\/|^@\//g, '').split('/')[0]);
            }) ?? target
          : target;

        violations.push({
          sourceFile: filePath,
          targetFile: target,
          sourceLayer,
          targetLayer,
          importStatement,
          message:
            `Layer violation: ${sourceLayer} -> ${targetLayer}. ` +
            `The "${sourceLayer}" layer is only allowed to depend on: ` +
            `${allowed.size > 0 ? [...allowed].join(', ') : 'nothing (it should have no dependencies)'}.`,
        });
      }
    }
  }

  return violations;
}

/**
 * Infer layer assignments from directory structure when no explicit
 * layer config is provided. Uses common naming conventions.
 */
export function inferLayers(files: ParsedFile[]): LayerDefinition[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.filePath.split('/');
    for (let i = 0; i < Math.min(parts.length - 1, 3); i++) {
      dirs.add(parts.slice(0, i + 1).join('/'));
    }
  }

  const layerPatterns: Record<string, string[]> = {
    presentation: ['ui', 'views', 'pages', 'components', 'presentation', 'frontend', 'web'],
    application: ['application', 'services', 'use-cases', 'usecases', 'handlers', 'controllers'],
    domain: ['domain', 'entities', 'models', 'core', 'business'],
    infrastructure: ['infrastructure', 'repositories', 'adapters', 'db', 'database', 'external', 'clients'],
  };

  const detectedLayers: LayerDefinition[] = [];

  for (const [layerName, keywords] of Object.entries(layerPatterns)) {
    const matchingDirs = [...dirs].filter((d) =>
      keywords.some((kw) => d.toLowerCase().includes(kw))
    );

    if (matchingDirs.length > 0) {
      const patterns = matchingDirs.map((d) => `${d}/**`);
      const allowedDeps = getDefaultAllowedDeps(layerName);
      detectedLayers.push({
        name: layerName,
        patterns,
        allowedDependencies: allowedDeps,
      });
    }
  }

  return detectedLayers;
}

function getDefaultAllowedDeps(layerName: string): string[] {
  switch (layerName) {
    case 'presentation': return ['application', 'domain'];
    case 'application': return ['domain'];
    case 'domain': return [];
    case 'infrastructure': return ['domain', 'application'];
    default: return [];
  }
}
