'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Edit3, Save, User, X } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface SummaryDetail {
  id: string;
  title: string;
  type: 'daily' | 'weekly' | 'sprint' | 'custom';
  developerName?: string;
  period: { start: string; end: string };
  content: string;
  createdAt: string;
  updatedAt: string;
}

const typeColors: Record<string, string> = {
  daily: 'bg-blue-100 text-blue-700',
  weekly: 'bg-purple-100 text-purple-700',
  sprint: 'bg-green-100 text-green-700',
  custom: 'bg-gray-100 text-gray-700',
};

export default function SummaryDetailPage() {
  const params = useParams<{ id: string }>();
  const [summary, setSummary] = useState<SummaryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchSummary() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<SummaryDetail>(`/summaries/${params.id}`);
        setSummary(data);
        setEditContent(data.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch summary');
      } finally {
        setLoading(false);
      }
    }
    fetchSummary();
  }, [params.id]);

  const handleSave = useCallback(async () => {
    if (!summary) return;
    setSaving(true);
    try {
      const updated = await apiFetch<SummaryDetail>(`/summaries/${params.id}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editContent }),
      });
      setSummary(updated);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save summary');
    } finally {
      setSaving(false);
    }
  }, [summary, editContent, params.id]);

  const handleCancel = useCallback(() => {
    setEditContent(summary?.content || '');
    setIsEditing(false);
  }, [summary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="space-y-4">
        <Link href="/summaries" className="btn-ghost gap-2 inline-flex">
          <ArrowLeft className="w-4 h-4" /> Back to Summaries
        </Link>
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error || 'Summary not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <Link href="/summaries" className="btn-ghost gap-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back to Summaries
      </Link>

      {/* Header */}
      <div className="card-padded">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize',
                  typeColors[summary.type],
                )}
              >
                {summary.type}
              </span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{summary.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="btn-secondary gap-2"
              >
                <Edit3 className="w-4 h-4" /> Edit
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="btn-ghost gap-2"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="btn-primary gap-2"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {formatDate(summary.period.start)} - {formatDate(summary.period.end)}
          </span>
          {summary.developerName && (
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              {summary.developerName}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="card-padded">
        {isEditing ? (
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
              Summary Content
            </label>
            <textarea
              id="content"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="input-field min-h-[400px] font-mono text-sm"
              placeholder="Enter summary content..."
            />
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            {summary.content.split('\n').map((paragraph, i) => (
              <p key={i} className="text-gray-700 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Footer meta */}
      <div className="text-xs text-gray-400 flex items-center justify-between">
        <span>Created: {formatDate(summary.createdAt)}</span>
        <span>Last updated: {formatDate(summary.updatedAt)}</span>
      </div>
    </div>
  );
}
