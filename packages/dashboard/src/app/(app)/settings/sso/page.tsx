'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Save,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface SSOConfig {
  enabled: boolean;
  idpEntityId: string;
  ssoUrl: string;
  certificate: string;
  spEntityId: string;
  acsUrl: string;
  enforceSSO: boolean;
}

export default function SSOPage() {
  const [config, setConfig] = useState<SSOConfig>({
    enabled: false,
    idpEntityId: '',
    ssoUrl: '',
    certificate: '',
    spEntityId: '',
    acsUrl: '',
    enforceSSO: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<SSOConfig>('/settings/sso');
        setConfig(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch SSO configuration');
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await apiFetch<SSOConfig>('/settings/sso', {
        method: 'PUT',
        body: JSON.stringify(config),
      });
      setConfig(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save SSO configuration');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleCopy = useCallback((field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <Link href="/settings" className="btn-ghost gap-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back to Settings
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SAML SSO Configuration</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure SAML-based Single Sign-On for your organization.
        </p>
      </div>

      {/* Success / Error banners */}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <p className="text-sm text-green-800">SSO configuration saved successfully.</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Enable SSO toggle */}
      <div className="card-padded">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-brand-600" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Enable SAML SSO</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Allow team members to sign in using your identity provider.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfig({ ...config, enabled: !config.enabled })}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              config.enabled ? 'bg-brand-600' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                config.enabled ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>
      </div>

      {/* Service Provider info (read-only) */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Service Provider (SP) Details
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Provide these values to your identity provider when configuring the SAML application.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SP Entity ID</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={config.spEntityId}
                readOnly
                className="input-field bg-gray-50 font-mono text-sm flex-1"
              />
              <button
                type="button"
                onClick={() => handleCopy('spEntityId', config.spEntityId)}
                className="btn-ghost gap-1"
              >
                <Copy className="w-4 h-4" />
                {copied === 'spEntityId' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ACS (Assertion Consumer Service) URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={config.acsUrl}
                readOnly
                className="input-field bg-gray-50 font-mono text-sm flex-1"
              />
              <button
                type="button"
                onClick={() => handleCopy('acsUrl', config.acsUrl)}
                className="btn-ghost gap-1"
              >
                <Copy className="w-4 h-4" />
                {copied === 'acsUrl' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Identity Provider configuration */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Identity Provider (IdP) Configuration
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Enter the details from your identity provider (Okta, Azure AD, Google Workspace, etc.).
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="idpEntityId" className="block text-sm font-medium text-gray-700 mb-1">
              IdP Entity ID (Issuer)
            </label>
            <input
              id="idpEntityId"
              type="text"
              value={config.idpEntityId}
              onChange={(e) => setConfig({ ...config, idpEntityId: e.target.value })}
              placeholder="https://idp.example.com/saml/metadata"
              className="input-field font-mono text-sm"
            />
          </div>

          <div>
            <label htmlFor="ssoUrl" className="block text-sm font-medium text-gray-700 mb-1">
              SSO URL (Login URL)
            </label>
            <input
              id="ssoUrl"
              type="url"
              value={config.ssoUrl}
              onChange={(e) => setConfig({ ...config, ssoUrl: e.target.value })}
              placeholder="https://idp.example.com/saml/login"
              className="input-field font-mono text-sm"
            />
          </div>

          <div>
            <label htmlFor="certificate" className="block text-sm font-medium text-gray-700 mb-1">
              X.509 Certificate
            </label>
            <textarea
              id="certificate"
              value={config.certificate}
              onChange={(e) => setConfig({ ...config, certificate: e.target.value })}
              placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDBzCCAe+gAwIBAgIJ...&#10;-----END CERTIFICATE-----"
              className="input-field min-h-[160px] font-mono text-xs"
            />
            <p className="text-xs text-gray-500 mt-1">
              Paste the full PEM-encoded X.509 certificate from your IdP.
            </p>
          </div>
        </div>
      </div>

      {/* Enforce SSO */}
      <div className="card-padded">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Enforce SSO</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              When enabled, all team members must sign in via SSO. Password-based login will be
              disabled for non-owner accounts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfig({ ...config, enforceSSO: !config.enforceSSO })}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              config.enforceSSO ? 'bg-brand-600' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                config.enforceSSO ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>
      </div>

      {/* Help link */}
      <div className="card p-4 flex items-center gap-3 bg-blue-50 border-blue-200">
        <Shield className="w-5 h-5 text-blue-600 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-blue-900">Need help setting up SSO?</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Check our documentation for step-by-step guides on configuring SAML SSO with popular identity providers.
          </p>
        </div>
        <a href="#" className="btn-ghost text-blue-700 gap-1 text-xs shrink-0">
          <ExternalLink className="w-3.5 h-3.5" /> View Docs
        </a>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3">
        <Link href="/settings" className="btn-ghost">
          Cancel
        </Link>
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
