'use client';

import { useState } from 'react';
import { LayoutGrid, List, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDecisions,
  type DecisionCategory,
  type DecisionStatus,
} from '@/hooks/use-decisions';
import { DecisionCard } from '@/components/decisions/decision-card';
import { DecisionTable } from '@/components/decisions/decision-table';

const categories: { value: DecisionCategory | ''; label: string }[] = [
  { value: '', label: 'All Categories' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'dependency', label: 'Dependency' },
  { value: 'convention', label: 'Convention' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
];

const statuses: { value: DecisionStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'superseded', label: 'Superseded' },
];

export default function DecisionsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DecisionCategory | ''>('');
  const [status, setStatus] = useState<DecisionStatus | ''>('');
  const [view, setView] = useState<'table' | 'grid'>('table');

  const { decisions, loading, error } = useDecisions({
    search: search || undefined,
    category: category || undefined,
    status: status || undefined,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Architectural Decisions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track and manage architectural decisions across your repositories.
        </p>
      </div>

      {/* Filters bar */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search decisions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>

          {/* Category filter */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DecisionCategory | '')}
            className="input-field w-full sm:w-44"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DecisionStatus | '')}
            className="input-field w-full sm:w-40"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setView('table')}
              className={cn(
                'p-2 transition-colors',
                view === 'table' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600',
              )}
              title="Table view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={cn(
                'p-2 transition-colors',
                view === 'grid' ? 'bg-brand-50 text-brand-600' : 'text-gray-400 hover:text-gray-600',
              )}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="card p-6 text-center">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && (
        <>
          <div className="text-sm text-gray-500">
            {decisions.length} decision{decisions.length !== 1 ? 's' : ''} found
          </div>

          {view === 'table' ? (
            <div className="card overflow-hidden">
              <DecisionTable decisions={decisions} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {decisions.map((decision) => (
                <DecisionCard key={decision.id} decision={decision} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
