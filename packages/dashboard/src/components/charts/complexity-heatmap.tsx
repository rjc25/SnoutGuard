'use client';

import { cn } from '@/lib/utils';

export interface FileComplexity {
  filePath: string;
  complexity: number;
  linesOfCode: number;
  lastModified: string;
}

interface ComplexityHeatmapProps {
  data: FileComplexity[];
  maxComplexity?: number;
}

function getComplexityColor(complexity: number, max: number): string {
  const ratio = complexity / max;
  if (ratio >= 0.8) return 'bg-red-500';
  if (ratio >= 0.6) return 'bg-orange-400';
  if (ratio >= 0.4) return 'bg-yellow-400';
  if (ratio >= 0.2) return 'bg-lime-400';
  return 'bg-green-400';
}

function getComplexityLabel(complexity: number, max: number): string {
  const ratio = complexity / max;
  if (ratio >= 0.8) return 'Very High';
  if (ratio >= 0.6) return 'High';
  if (ratio >= 0.4) return 'Medium';
  if (ratio >= 0.2) return 'Low';
  return 'Very Low';
}

export function ComplexityHeatmap({ data, maxComplexity }: ComplexityHeatmapProps) {
  const max = maxComplexity ?? Math.max(...data.map((d) => d.complexity), 1);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No complexity data available
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.complexity - a.complexity);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Low</span>
        <div className="flex gap-0.5">
          <div className="w-4 h-3 rounded-sm bg-green-400" />
          <div className="w-4 h-3 rounded-sm bg-lime-400" />
          <div className="w-4 h-3 rounded-sm bg-yellow-400" />
          <div className="w-4 h-3 rounded-sm bg-orange-400" />
          <div className="w-4 h-3 rounded-sm bg-red-500" />
        </div>
        <span>High</span>
      </div>

      {/* Heatmap Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {sorted.map((file) => (
          <div
            key={file.filePath}
            className="group relative"
            title={`${file.filePath}\nComplexity: ${file.complexity}\nLines: ${file.linesOfCode}`}
          >
            <div
              className={cn(
                'rounded-lg p-3 h-20 flex flex-col justify-between cursor-default transition-transform hover:scale-105',
                getComplexityColor(file.complexity, max),
              )}
            >
              <span className="text-2xs font-mono text-white/90 truncate block">
                {file.filePath.split('/').pop()}
              </span>
              <div className="flex items-end justify-between">
                <span className="text-xs font-bold text-white">{file.complexity}</span>
                <span className="text-2xs text-white/70">{file.linesOfCode} LOC</span>
              </div>
            </div>
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
              <div className="bg-slate-900 text-white rounded-lg px-3 py-2 text-xs shadow-lg whitespace-nowrap">
                <p className="font-mono text-xs">{file.filePath}</p>
                <p className="mt-1">
                  Complexity: <strong>{file.complexity}</strong> ({getComplexityLabel(file.complexity, max)})
                </p>
                <p>Lines: {file.linesOfCode}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
