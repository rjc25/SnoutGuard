'use client';

import { useCallback, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import type { Decision, DecisionCategory, DecisionStatus } from '@/hooks/use-decisions';

interface DecisionFormData {
  title: string;
  description: string;
  category: DecisionCategory;
  status: DecisionStatus;
  confidence: number;
  tags: string[];
  constraints: string[];
}

interface DecisionEditorProps {
  decision?: Decision;
  onSave?: (decision: Decision) => void;
  onCancel?: () => void;
}

const categories: { value: DecisionCategory; label: string }[] = [
  { value: 'architecture', label: 'Architecture' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'dependency', label: 'Dependency' },
  { value: 'convention', label: 'Convention' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
];

const statuses: { value: DecisionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'superseded', label: 'Superseded' },
];

const emptyForm: DecisionFormData = {
  title: '',
  description: '',
  category: 'architecture',
  status: 'pending',
  confidence: 80,
  tags: [],
  constraints: [],
};

export function DecisionEditor({ decision, onSave, onCancel }: DecisionEditorProps) {
  const [form, setForm] = useState<DecisionFormData>(() =>
    decision
      ? {
          title: decision.title,
          description: decision.description,
          category: decision.category,
          status: decision.status,
          confidence: decision.confidence,
          tags: [...decision.tags],
          constraints: [...decision.constraints],
        }
      : emptyForm,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [constraintInput, setConstraintInput] = useState('');

  const isEditing = !!decision;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.title.trim()) {
        setError('Title is required');
        return;
      }
      if (!form.description.trim()) {
        setError('Description is required');
        return;
      }

      setSaving(true);
      setError(null);
      try {
        let result: Decision;
        if (isEditing) {
          result = await apiFetch<Decision>(`/decisions/${decision.id}`, {
            method: 'PUT',
            body: JSON.stringify(form),
          });
        } else {
          result = await apiFetch<Decision>('/decisions', {
            method: 'POST',
            body: JSON.stringify(form),
          });
        }
        onSave?.(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save decision');
      } finally {
        setSaving(false);
      }
    },
    [form, isEditing, decision, onSave],
  );

  const addTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...form.tags, tag] });
    }
    setTagInput('');
  }, [tagInput, form]);

  const removeTag = useCallback(
    (tag: string) => {
      setForm({ ...form, tags: form.tags.filter((t) => t !== tag) });
    },
    [form],
  );

  const addConstraint = useCallback(() => {
    const constraint = constraintInput.trim();
    if (constraint && !form.constraints.includes(constraint)) {
      setForm({ ...form, constraints: [...form.constraints, constraint] });
    }
    setConstraintInput('');
  }, [constraintInput, form]);

  const removeConstraint = useCallback(
    (constraint: string) => {
      setForm({ ...form, constraints: form.constraints.filter((c) => c !== constraint) });
    },
    [form],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">
          {isEditing ? 'Edit Decision' : 'New Decision'}
        </h2>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="decision-title" className="block text-sm font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          id="decision-title"
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g., Use Repository Pattern for data access"
          className="input-field"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="decision-description"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Description
        </label>
        <textarea
          id="decision-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Describe the architectural decision and its rationale..."
          className="input-field min-h-[120px]"
          required
        />
      </div>

      {/* Category and Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label
            htmlFor="decision-category"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Category
          </label>
          <select
            id="decision-category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as DecisionCategory })}
            className="input-field"
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="decision-status"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Status
          </label>
          <select
            id="decision-status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as DecisionStatus })}
            className="input-field"
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="decision-confidence"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Confidence ({form.confidence}%)
          </label>
          <input
            id="decision-confidence"
            type="range"
            min={0}
            max={100}
            value={form.confidence}
            onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
          />
          <div className="flex justify-between text-2xs text-gray-400 mt-1">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add a tag..."
            className="input-field flex-1"
          />
          <button type="button" onClick={addTag} className="btn-secondary gap-1">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Constraints */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Constraints</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={constraintInput}
            onChange={(e) => setConstraintInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addConstraint();
              }
            }}
            placeholder="Add a constraint..."
            className="input-field flex-1"
          />
          <button type="button" onClick={addConstraint} className="btn-secondary gap-1">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {form.constraints.length > 0 && (
          <div className="space-y-2 mt-2">
            {form.constraints.map((constraint) => (
              <div
                key={constraint}
                className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2"
              >
                <p className="text-sm text-gray-700">{constraint}</p>
                <button
                  type="button"
                  onClick={() => removeConstraint(constraint)}
                  className="text-gray-400 hover:text-red-500 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
        <button type="submit" disabled={saving} className="btn-primary gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : isEditing ? 'Update Decision' : 'Create Decision'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
