'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Copy, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffFile {
  filePath: string;
  language?: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

interface DiffViewerProps {
  files: DiffFile[];
  defaultExpanded?: boolean;
}

const lineTypeStyles: Record<DiffLine['type'], string> = {
  add: 'bg-green-50 text-green-900',
  remove: 'bg-red-50 text-red-900',
  context: 'bg-white text-gray-700',
};

const lineTypeGutter: Record<DiffLine['type'], string> = {
  add: 'bg-green-100 text-green-600',
  remove: 'bg-red-100 text-red-600',
  context: 'bg-gray-50 text-gray-400',
};

const lineTypePrefix: Record<DiffLine['type'], string> = {
  add: '+',
  remove: '-',
  context: ' ',
};

function DiffFileView({
  file,
  defaultExpanded,
}: {
  file: DiffFile;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const totalChanges = file.additions + file.deletions;

  const handleCopy = () => {
    const content = file.hunks
      .flatMap((h) => [h.header, ...h.lines.map((l) => `${lineTypePrefix[l.type]}${l.content}`)])
      .join('\n');
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* File header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <FileCode className="w-4 h-4 text-gray-500 shrink-0" />
        <span className="text-sm font-mono text-gray-900 truncate flex-1">{file.filePath}</span>
        <div className="flex items-center gap-2 shrink-0">
          {file.additions > 0 && (
            <span className="text-xs font-medium text-green-700">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-xs font-medium text-red-700">-{file.deletions}</span>
          )}
          <div className="flex gap-px">
            {Array.from({ length: Math.min(totalChanges, 5) }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-2 h-2 rounded-sm',
                  i < Math.ceil((file.additions / totalChanges) * Math.min(totalChanges, 5))
                    ? 'bg-green-500'
                    : 'bg-red-500',
                )}
              />
            ))}
          </div>
        </div>
      </button>

      {/* Diff content */}
      {expanded && (
        <div className="relative">
          {/* Copy button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-white shadow-sm border border-gray-200 hover:bg-gray-50 text-gray-500"
            title="Copy diff"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied && (
              <span className="absolute -top-7 right-0 text-2xs bg-gray-900 text-white px-2 py-0.5 rounded">
                Copied
              </span>
            )}
          </button>

          <div className="overflow-x-auto">
            {file.hunks.map((hunk, hunkIndex) => (
              <div key={hunkIndex}>
                {/* Hunk header */}
                <div className="bg-blue-50 text-blue-700 text-xs font-mono px-4 py-1 border-y border-blue-100">
                  {hunk.header}
                </div>

                {/* Lines */}
                <table className="w-full border-collapse">
                  <tbody>
                    {hunk.lines.map((line, lineIndex) => (
                      <tr
                        key={lineIndex}
                        className={cn(lineTypeStyles[line.type], 'group')}
                      >
                        {/* Old line number */}
                        <td
                          className={cn(
                            'w-12 text-right px-2 py-0 text-2xs font-mono select-none border-r',
                            lineTypeGutter[line.type],
                          )}
                        >
                          {line.type !== 'add' ? line.oldLineNumber : ''}
                        </td>
                        {/* New line number */}
                        <td
                          className={cn(
                            'w-12 text-right px-2 py-0 text-2xs font-mono select-none border-r',
                            lineTypeGutter[line.type],
                          )}
                        >
                          {line.type !== 'remove' ? line.newLineNumber : ''}
                        </td>
                        {/* Prefix */}
                        <td
                          className={cn(
                            'w-6 text-center py-0 text-xs font-mono select-none',
                            line.type === 'add' && 'text-green-600',
                            line.type === 'remove' && 'text-red-600',
                            line.type === 'context' && 'text-gray-400',
                          )}
                        >
                          {lineTypePrefix[line.type]}
                        </td>
                        {/* Content */}
                        <td className="py-0 pl-1 pr-4">
                          <pre className="text-xs font-mono whitespace-pre overflow-visible">
                            {line.content}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function DiffViewer({ files, defaultExpanded = true }: DiffViewerProps) {
  const stats = useMemo(() => {
    return files.reduce(
      (acc, file) => ({
        additions: acc.additions + file.additions,
        deletions: acc.deletions + file.deletions,
        files: acc.files + 1,
      }),
      { additions: 0, deletions: 0, files: 0 },
    );
  }, [files]);

  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No file changes to display.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span>
          Showing <strong>{stats.files}</strong> changed file{stats.files !== 1 ? 's' : ''}
        </span>
        <span className="text-green-700 font-medium">+{stats.additions}</span>
        <span className="text-red-700 font-medium">-{stats.deletions}</span>
      </div>

      {/* File diffs */}
      <div className="space-y-3">
        {files.map((file) => (
          <DiffFileView key={file.filePath} file={file} defaultExpanded={defaultExpanded} />
        ))}
      </div>
    </div>
  );
}
