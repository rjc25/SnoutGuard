'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Edit3,
  Plus,
  Save,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

type Severity = 'error' | 'warning' | 'info';

interface ArchRule {
  id: string;
  name: string;
  pattern: string;
  description: string;
  severity: Severity;
  isActive: boolean;
  createdAt: string;
}

interface RuleFormData {
  name: string;
  pattern: string;
  description: string;
  severity: Severity;
}

const emptyForm: RuleFormData = {
  name: '',
  pattern: '',
  description: '',
  severity: 'warning',
};

const severityColors: Record<Severity, string> = {
  error: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
};

export default function RulesPage() {
  const [rules, setRules] = useState<ArchRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ArchRule[]>('/settings/rules');
      setRules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.name.trim() || !form.pattern.trim()) {
        setError('Name and pattern are required');
        return;
      }

      setSaving(true);
      setError(null);
      try {
        if (editingId) {
          const updated = await apiFetch<ArchRule>(`/settings/rules/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(form),
          });
          setRules((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
        } else {
          const created = await apiFetch<ArchRule>('/settings/rules', {
            method: 'POST',
            body: JSON.stringify(form),
          });
          setRules((prev) => [...prev, created]);
        }
        setForm(emptyForm);
        setShowForm(false);
        setEditingId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save rule');
      } finally {
        setSaving(false);
      }
    },
    [form, editingId],
  );

  const handleEdit = useCallback((rule: ArchRule) => {
    setForm({
      name: rule.name,
      pattern: rule.pattern,
      description: rule.description,
      severity: rule.severity,
    });
    setEditingId(rule.id);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (ruleId: string) => {
    try {
      await apiFetch(`/settings/rules/${ruleId}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  }, []);

  const handleToggle = useCallback(async (rule: ArchRule) => {
    try {
      const updated = await apiFetch<ArchRule>(`/settings/rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  }, []);

  const cancelForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back link */}
      <Link href="/settings" className="btn-ghost gap-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Rules</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define custom architectural rules to enforce patterns in your codebase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(emptyForm);
            setEditingId(null);
            setShowForm(true);
          }}
          className="btn-primary gap-2"
        >
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card-padded">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">
              {editingId ? 'Edit Rule' : 'New Rule'}
            </h2>
            <button type="button" onClick={cancelForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ruleName" className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name
                </label>
                <input
                  id="ruleName"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., no-direct-db-access"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label htmlFor="severity" className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <select
                  id="severity"
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}
                  className="input-field"
                >
                  <option value="error">Error</option>
                  <option value="warning">Warning</option>
                  <option value="info">Info</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="pattern" className="block text-sm font-medium text-gray-700 mb-1">
                Pattern (glob or regex)
              </label>
              <input
                id="pattern"
                type="text"
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                placeholder="e.g., src/services/**/*.ts should not import from src/db/**"
                className="input-field font-mono text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Explain why this rule exists..."
                className="input-field min-h-[80px]"
              />
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving} className="btn-primary gap-2">
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}
              </button>
              <button type="button" onClick={cancelForm} className="btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rules table */}
      <div className="card overflow-hidden">
        {rules.length === 0 ? (
          <div className="text-center py-12">
            <Sliders className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700">No custom rules</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Create custom rules to enforce architectural patterns.
            </p>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="btn-primary gap-2"
            >
              <Plus className="w-4 h-4" /> Add First Rule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Active</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Pattern</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Severity</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggle(rule)}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          rule.isActive ? 'bg-brand-600' : 'bg-gray-300',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                            rule.isActive ? 'translate-x-4.5' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-gray-900">{rule.name}</p>
                        {rule.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {rule.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-700">
                        {rule.pattern}
                      </code>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium capitalize',
                          severityColors[rule.severity],
                        )}
                      >
                        <AlertCircle className="w-3 h-3" />
                        {rule.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(rule)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 transition-colors rounded"
                          title="Edit rule"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rule.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded"
                          title="Delete rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
