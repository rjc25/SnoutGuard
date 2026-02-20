'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { SummaryCard, type SummaryData } from '@/components/summaries/summary-card';

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'custom', label: 'Custom' },
];

const periodOptions = [
  { value: '', label: 'All Periods' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export default function SummariesPage() {
  const [summaries, setSummaries] = useState<SummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [developer, setDeveloper] = useState('');
  const [period, setPeriod] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (developer) params.set('developer', developer);
      if (period) params.set('period', period);
      const query = params.toString();
      const data = await apiFetch<SummaryData[]>(`/summaries${query ? `?${query}` : ''}`);
      setSummaries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch summaries');
    } finally {
      setLoading(false);
    }
  }, [type, developer, period]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  const filtered = searchQuery
    ? summaries.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.developerName?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : summaries;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Work Summaries</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-generated summaries of team and individual work.
        </p>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search summaries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="input-field w-full sm:w-36"
          >
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Developer name..."
            value={developer}
            onChange={(e) => setDeveloper(e.target.value)}
            className="input-field w-full sm:w-44"
          />
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="input-field w-full sm:w-40"
          >
            {periodOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {!loading && !error && (
        <>
          <p className="text-sm text-gray-500">
            {filtered.length} summar{filtered.length !== 1 ? 'ies' : 'y'} found
          </p>
          {filtered.length === 0 ? (
            <div className="card-padded text-center text-gray-400 text-sm">
              No summaries found matching your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((summary) => (
                <SummaryCard key={summary.id} summary={summary} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
