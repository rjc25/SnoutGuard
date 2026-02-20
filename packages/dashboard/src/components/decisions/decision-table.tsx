'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Decision, DecisionCategory, DecisionStatus } from '@/hooks/use-decisions';

interface DecisionTableProps {
  decisions: Decision[];
}

type SortField = 'title' | 'category' | 'status' | 'confidence' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

const categoryColors: Record<DecisionCategory, string> = {
  architecture: 'bg-purple-100 text-purple-700',
  pattern: 'bg-blue-100 text-blue-700',
  dependency: 'bg-cyan-100 text-cyan-700',
  convention: 'bg-green-100 text-green-700',
  security: 'bg-red-100 text-red-700',
  performance: 'bg-orange-100 text-orange-700',
};

const statusColors: Record<DecisionStatus, string> = {
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  pending: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
  deprecated: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  superseded: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

export function DecisionTable({ decisions }: DecisionTableProps) {
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField],
  );

  const sorted = useMemo(() => {
    return [...decisions].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'category':
          cmp = a.category.localeCompare(b.category);
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'confidence':
          cmp = a.confidence - b.confidence;
          break;
        case 'updatedAt':
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [decisions, sortField, sortDirection]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-brand-600" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-brand-600" />
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        No decisions found matching your filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {(
              [
                { key: 'title', label: 'Title' },
                { key: 'category', label: 'Category' },
                { key: 'status', label: 'Status' },
                { key: 'confidence', label: 'Confidence' },
              ] as { key: SortField; label: string }[]
            ).map(({ key, label }) => (
              <th
                key={key}
                className="text-left py-3 px-4 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                onClick={() => handleSort(key)}
              >
                <div className="flex items-center gap-1.5">
                  {label}
                  <SortIcon field={key} />
                </div>
              </th>
            ))}
            <th className="text-left py-3 px-4 font-medium text-gray-500">Tags</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((decision) => (
            <tr
              key={decision.id}
              className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
            >
              <td className="py-3 px-4">
                <Link
                  href={`/decisions/${decision.id}`}
                  className="font-medium text-gray-900 hover:text-brand-600 transition-colors"
                >
                  {decision.title}
                </Link>
              </td>
              <td className="py-3 px-4">
                <span
                  className={cn(
                    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                    categoryColors[decision.category],
                  )}
                >
                  {decision.category}
                </span>
              </td>
              <td className="py-3 px-4">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                    statusColors[decision.status],
                  )}
                >
                  {decision.status}
                </span>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-center gap-2 w-32">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        decision.confidence >= 80
                          ? 'bg-green-500'
                          : decision.confidence >= 60
                            ? 'bg-yellow-500'
                            : 'bg-red-500',
                      )}
                      style={{ width: `${decision.confidence}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 tabular-nums">{decision.confidence}%</span>
                </div>
              </td>
              <td className="py-3 px-4">
                <div className="flex gap-1 flex-wrap">
                  {decision.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-2xs text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                  {decision.tags.length > 3 && (
                    <span className="text-2xs text-gray-400">+{decision.tags.length - 3}</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
