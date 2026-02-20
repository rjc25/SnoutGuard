'use client';

import { useCallback, useEffect, useState } from 'react';
import { Layers, GitFork, AlertTriangle, Link2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface DependencyStats {
  totalModules: number;
  totalDependencies: number;
  circularDependencies: number;
  avgCoupling: number;
  maxDepth: number;
}

interface DependencyNode {
  id: string;
  name: string;
  type: 'internal' | 'external';
  dependencyCount: number;
  dependentCount: number;
}

interface DependencyData {
  stats: DependencyStats;
  topModules: DependencyNode[];
}

export default function DependenciesPage() {
  const [data, setData] = useState<DependencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<DependencyData>('/dependencies');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dependency data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Dependencies</h1>
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error || 'Failed to load dependency data'}</p>
          <button type="button" onClick={fetchData} className="btn-secondary gap-2 mt-3">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Total Modules',
      value: data.stats.totalModules,
      icon: Layers,
      color: 'text-brand-600',
      bgColor: 'bg-brand-50',
    },
    {
      label: 'Circular Deps',
      value: data.stats.circularDependencies,
      icon: AlertTriangle,
      color: data.stats.circularDependencies > 0 ? 'text-red-600' : 'text-green-600',
      bgColor: data.stats.circularDependencies > 0 ? 'bg-red-50' : 'bg-green-50',
    },
    {
      label: 'Avg Coupling',
      value: data.stats.avgCoupling.toFixed(2),
      icon: Link2,
      color: data.stats.avgCoupling > 0.7 ? 'text-yellow-600' : 'text-green-600',
      bgColor: data.stats.avgCoupling > 0.7 ? 'bg-yellow-50' : 'bg-green-50',
    },
    {
      label: 'Max Depth',
      value: data.stats.maxDepth,
      icon: GitFork,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dependencies</h1>
          <p className="text-sm text-gray-500 mt-1">
            Visualize module dependencies and detect circular references across your codebase.
          </p>
        </div>
        <button type="button" onClick={fetchData} className="btn-secondary gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('rounded-lg p-2', metric.bgColor)}>
                <metric.icon className={cn('w-4 h-4', metric.color)} />
              </div>
            </div>
            <p className={cn('text-2xl font-bold', metric.color)}>{metric.value}</p>
            <p className="text-xs text-gray-500 mt-1">{metric.label}</p>
          </div>
        ))}
      </div>

      {/* Info Banner */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <div className="flex items-start gap-3">
          <Layers className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Interactive Dependency Graph</p>
            <p className="text-xs text-blue-600 mt-1">
              The graph below is interactive. Click and drag nodes to rearrange the layout.
              Hover over a module to highlight its connections. Scroll to zoom in and out.
            </p>
          </div>
        </div>
      </div>

      {/* Circular dependency warning */}
      {data.stats.circularDependencies > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm">
          <p className="font-medium text-red-800">
            {data.stats.circularDependencies} circular{' '}
            {data.stats.circularDependencies === 1 ? 'dependency' : 'dependencies'} detected
          </p>
          <p className="text-red-600 mt-1">
            Circular dependencies can lead to build issues, increased bundle sizes, and make
            code harder to maintain. Review the graph below to identify the cycles.
          </p>
        </div>
      )}

      {/* Graph Visualization Placeholder */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Module Graph</h2>
        <div className="relative w-full rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center"
             style={{ minHeight: '500px' }}>
          <div className="text-center">
            <GitFork className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">Dependency Graph Visualization</p>
            <p className="text-xs text-gray-400 mt-1">
              {data.stats.totalModules} modules with {data.stats.totalDependencies} connections
            </p>
          </div>
        </div>
      </div>

      {/* Top Connected Modules */}
      {data.topModules && data.topModules.length > 0 && (
        <div className="card-padded">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Most Connected Modules</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Module</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Type</th>
                  <th className="text-right py-2 pr-4 font-medium text-gray-500">Dependencies</th>
                  <th className="text-right py-2 font-medium text-gray-500">Dependents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.topModules.map((mod) => (
                  <tr key={mod.id} className="hover:bg-gray-50/50">
                    <td className="py-3 pr-4 font-mono text-gray-900">{mod.name}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          mod.type === 'internal'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {mod.type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-700">{mod.dependencyCount}</td>
                    <td className="py-3 text-right text-gray-700">{mod.dependentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
