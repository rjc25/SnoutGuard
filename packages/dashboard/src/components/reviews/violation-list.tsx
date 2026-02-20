'use client';

import { AlertCircle, AlertTriangle, FileCode2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Violation, ViolationSeverity } from '@/hooks/use-reviews';

interface ViolationListProps {
  violations: Violation[];
  groupByFile?: boolean;
}

const severityConfig: Record<
  ViolationSeverity,
  { icon: typeof AlertCircle; color: string; bgColor: string; label: string }
> = {
  error: {
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
    label: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 border-yellow-200',
    label: 'Warning',
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    label: 'Info',
  },
};

function ViolationItem({ violation }: { violation: Violation }) {
  const config = severityConfig[violation.severity];
  const Icon = config.icon;

  return (
    <div className={cn('border rounded-lg p-4', config.bgColor)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{violation.ruleName}</span>
            <span className="text-2xs bg-white/60 rounded px-1.5 py-0.5 text-gray-500 font-mono">
              {violation.ruleId}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1">{violation.message}</p>

          {/* File reference */}
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
            <FileCode2 className="w-3.5 h-3.5" />
            <span className="font-mono">
              {violation.filePath}:{violation.lineStart}
              {violation.lineEnd !== violation.lineStart && `-${violation.lineEnd}`}
            </span>
          </div>

          {/* Code snippet */}
          {violation.codeSnippet && (
            <div className="mt-2 bg-slate-900 rounded-md overflow-x-auto">
              <pre className="p-3 text-xs">
                <code className="text-gray-300 font-mono">
                  {violation.codeSnippet.split('\n').map((line, i) => (
                    <div key={i} className="flex">
                      <span className="select-none text-slate-500 text-right w-8 pr-3 shrink-0">
                        {violation.lineStart + i}
                      </span>
                      <span className="flex-1 whitespace-pre">{line}</span>
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          )}

          {/* Suggestion */}
          {violation.suggestion && (
            <div className="mt-2 p-2.5 bg-white/80 rounded-md border border-gray-200">
              <p className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">Suggestion:</span>{' '}
                {violation.suggestion}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ViolationList({ violations, groupByFile = true }: ViolationListProps) {
  if (violations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No violations found.
      </div>
    );
  }

  if (!groupByFile) {
    return (
      <div className="space-y-3">
        {violations.map((v) => (
          <ViolationItem key={v.id} violation={v} />
        ))}
      </div>
    );
  }

  // Group by file
  const grouped = violations.reduce<Record<string, Violation[]>>((acc, v) => {
    if (!acc[v.filePath]) acc[v.filePath] = [];
    acc[v.filePath].push(v);
    return acc;
  }, {});

  const sortedFiles = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      {sortedFiles.map((filePath) => {
        const fileViolations = grouped[filePath];
        const errorCount = fileViolations.filter((v) => v.severity === 'error').length;
        const warningCount = fileViolations.filter((v) => v.severity === 'warning').length;
        const infoCount = fileViolations.filter((v) => v.severity === 'info').length;

        return (
          <div key={filePath}>
            <div className="flex items-center gap-3 mb-3">
              <FileCode2 className="w-4 h-4 text-gray-500" />
              <h4 className="text-sm font-mono font-medium text-gray-900">{filePath}</h4>
              <div className="flex items-center gap-2 text-xs">
                {errorCount > 0 && (
                  <span className="text-red-600 font-medium">{errorCount} errors</span>
                )}
                {warningCount > 0 && (
                  <span className="text-yellow-600 font-medium">{warningCount} warnings</span>
                )}
                {infoCount > 0 && (
                  <span className="text-blue-600 font-medium">{infoCount} info</span>
                )}
              </div>
            </div>
            <div className="space-y-2 pl-7">
              {fileViolations
                .sort((a, b) => a.lineStart - b.lineStart)
                .map((v) => (
                  <ViolationItem key={v.id} violation={v} />
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
