'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DecisionEvidence } from '@/hooks/use-decisions';

interface EvidenceViewerProps {
  evidence: DecisionEvidence[];
}

interface EvidenceItemProps {
  item: DecisionEvidence;
  defaultOpen?: boolean;
}

function EvidenceItem({ item, defaultOpen = false }: EvidenceItemProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <FileCode2 className="w-4 h-4 text-gray-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-mono text-gray-700 truncate block">
            {item.filePath}
          </span>
          <span className="text-xs text-gray-400">
            Lines {item.lineStart}-{item.lineEnd}
          </span>
        </div>
        <span className="text-2xs bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 uppercase font-medium shrink-0">
          {item.language}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-200">
          {/* Code snippet */}
          <div className="bg-slate-900 overflow-x-auto">
            <pre className="p-4 text-sm leading-relaxed">
              <code className="text-gray-300 font-mono">
                {item.snippet.split('\n').map((line, i) => (
                  <div key={i} className="flex">
                    <span className="select-none text-slate-500 text-right w-10 pr-4 shrink-0">
                      {item.lineStart + i}
                    </span>
                    <span className="flex-1 whitespace-pre">{line}</span>
                  </div>
                ))}
              </code>
            </pre>
          </div>

          {/* Explanation */}
          {item.explanation && (
            <div className="px-4 py-3 bg-blue-50 border-t border-blue-100">
              <p className="text-sm text-blue-800">
                <span className="font-medium">Explanation:</span> {item.explanation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EvidenceViewer({ evidence }: EvidenceViewerProps) {
  if (evidence.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No evidence available for this decision.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">
        Evidence ({evidence.length} {evidence.length === 1 ? 'item' : 'items'})
      </h3>
      <div className="space-y-2">
        {evidence.map((item, index) => (
          <EvidenceItem key={item.id} item={item} defaultOpen={index === 0} />
        ))}
      </div>
    </div>
  );
}
