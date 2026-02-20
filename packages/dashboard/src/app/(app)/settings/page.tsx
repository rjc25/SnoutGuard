'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CreditCard,
  Key,
  Save,
  Settings,
  Shield,
  Sliders,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface OrgSettings {
  name: string;
  slug: string;
  plan: 'free' | 'team' | 'enterprise';
  billingEmail: string;
  createdAt: string;
  analysis: {
    autoReview: boolean;
    reviewOnPush: boolean;
    reviewOnPr: boolean;
    driftThreshold: number;
    minConfidence: number;
  };
}

const planDetails: Record<string, { label: string; color: string; features: string[] }> = {
  free: {
    label: 'Free',
    color: 'bg-gray-100 text-gray-700',
    features: ['1 repository', '5 decisions', 'Basic analysis'],
  },
  team: {
    label: 'Team',
    color: 'bg-blue-100 text-blue-700',
    features: ['10 repositories', 'Unlimited decisions', 'Advanced analysis', 'Team velocity'],
  },
  enterprise: {
    label: 'Enterprise',
    color: 'bg-purple-100 text-purple-700',
    features: [
      'Unlimited repositories',
      'Unlimited decisions',
      'Custom rules',
      'SAML SSO',
      'Priority support',
    ],
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<OrgSettings>('/settings');
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch settings');
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await apiFetch<OrgSettings>('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  const plan = planDetails[settings.plan];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">General Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your organization settings and analysis configuration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings/integrations" className="btn-secondary gap-2">
            <Key className="w-4 h-4" /> Integrations
          </Link>
          <Link href="/settings/rules" className="btn-secondary gap-2">
            <Sliders className="w-4 h-4" /> Rules
          </Link>
          <Link href="/settings/sso" className="btn-secondary gap-2">
            <Shield className="w-4 h-4" /> SSO
          </Link>
        </div>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-800">Settings saved successfully.</p>
        </div>
      )}
      {error && settings && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Organization info */}
      <div className="card-padded">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Organization</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-1">
              Organization Name
            </label>
            <input
              id="orgName"
              type="text"
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="orgSlug" className="block text-sm font-medium text-gray-700 mb-1">
              Slug
            </label>
            <input
              id="orgSlug"
              type="text"
              value={settings.slug}
              onChange={(e) => setSettings({ ...settings, slug: e.target.value })}
              className="input-field font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor="billingEmail" className="block text-sm font-medium text-gray-700 mb-1">
              Billing Email
            </label>
            <input
              id="billingEmail"
              type="email"
              value={settings.billingEmail}
              onChange={(e) => setSettings({ ...settings, billingEmail: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
            <p className="text-sm text-gray-600 py-2">{formatDate(settings.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Plan info */}
      <div className="card-padded">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Plan</h2>
        </div>

        <div className="flex items-start gap-6">
          <div>
            <span
              className={cn(
                'inline-flex items-center rounded-md px-3 py-1 text-sm font-medium',
                plan.color,
              )}
            >
              {plan.label}
            </span>
          </div>
          <div className="flex-1">
            <ul className="space-y-1">
              {plan.features.map((feature) => (
                <li key={feature} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          {settings.plan !== 'enterprise' && (
            <button type="button" className="btn-primary">
              Upgrade Plan
            </button>
          )}
        </div>
      </div>

      {/* Analysis settings */}
      <div className="card-padded">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Analysis Settings</h2>
        </div>

        <div className="space-y-4">
          {/* Toggle options */}
          <div className="space-y-3">
            {(
              [
                {
                  key: 'autoReview' as const,
                  label: 'Auto Review',
                  description: 'Automatically trigger reviews when code changes are detected.',
                },
                {
                  key: 'reviewOnPush' as const,
                  label: 'Review on Push',
                  description: 'Trigger a review when code is pushed to the default branch.',
                },
                {
                  key: 'reviewOnPr' as const,
                  label: 'Review on Pull Request',
                  description: 'Trigger a review when a pull request is opened or updated.',
                },
              ] as const
            ).map((option) => (
              <div
                key={option.key}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{option.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      analysis: {
                        ...settings.analysis,
                        [option.key]: !settings.analysis[option.key],
                      },
                    })
                  }
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    settings.analysis[option.key] ? 'bg-brand-600' : 'bg-gray-300',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      settings.analysis[option.key] ? 'translate-x-6' : 'translate-x-1',
                    )}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* Numeric settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label
                htmlFor="driftThreshold"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Drift Threshold (%)
              </label>
              <input
                id="driftThreshold"
                type="number"
                min={0}
                max={100}
                value={settings.analysis.driftThreshold}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    analysis: {
                      ...settings.analysis,
                      driftThreshold: Number(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
              <p className="text-xs text-gray-500 mt-1">
                Alert when drift exceeds this percentage.
              </p>
            </div>
            <div>
              <label
                htmlFor="minConfidence"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Min. Confidence (%)
              </label>
              <input
                id="minConfidence"
                type="number"
                min={0}
                max={100}
                value={settings.analysis.minConfidence}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    analysis: {
                      ...settings.analysis,
                      minConfidence: Number(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
              <p className="text-xs text-gray-500 mt-1">
                Only surface decisions above this confidence score.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
