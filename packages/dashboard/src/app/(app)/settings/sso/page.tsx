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
  XCircle,
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
  defaultRole: 'member' | 'admin' | 'viewer';
  enforceSSO: boolean;
  allowedDomains: string[];
  lastTestedAt?: string;
  testStatus?: 'success' | 'failed';
}

const roleOptions: { value: SSOConfig['defaultRole']; label: string; description: string }[] = [
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to dashboards and reviews' },
  { value: 'member', label: 'Member', description: 'Can create decisions and manage repositories' },
  { value: 'admin', label: 'Admin', description: 'Full access including organization settings' },
];

export default function SSOPage() {
  const [config, setConfig] = useState<SSOConfig>({
    enabled: false,
    idpEntityId: '',
    ssoUrl: '',
    certificate: '',
    spEntityId: '',
    acsUrl: '',
    defaultRole: 'member',
    enforceSSO: false,
    allowedDomains: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setError(null);
    try {
      const result = await apiFetch<{ status: 'success' | 'failed'; message?: string }>(
        '/settings/sso/test',
        { method: 'POST' },
      );
      setConfig((prev) => ({
        ...prev,
        testStatus: result.status,
        lastTestedAt: new Date().toISOString(),
      }));
      if (result.status === 'failed' && result.message) {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO connection test failed');
    } finally {
      setTesting(false);
    }
  }, []);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SAML SSO Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure SAML 2.0 Single Sign-On for your organization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !config.idpEntityId || !config.ssoUrl}
            className="btn-secondary gap-2"
          >
            <Shield className="w-4 h-4" />
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
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

      {/* Test status */}
      {config.testStatus && (
        <div
          className={cn(
            'rounded-lg border p-3 flex items-center gap-2',
            config.testStatus === 'success'
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200',
          )}
        >
          {config.testStatus === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <p
            className={cn(
              'text-sm',
              config.testStatus === 'success' ? 'text-green-800' : 'text-red-800',
            )}
          >
            {config.testStatus === 'success'
              ? 'SSO connection test passed. Your identity provider is configured correctly.'
              : 'SSO connection test failed. Check your configuration and try again.'}
          </p>
        </div>
      )}

      {/* Enable SSO toggle */}
      <div className="card-padded">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                config.enabled ? 'bg-green-100' : 'bg-gray-100',
              )}
            >
              <Shield
                className={cn(
                  'w-5 h-5',
                  config.enabled ? 'text-green-600' : 'text-gray-400',
                )}
              />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Enable SAML SSO</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {config.enabled
                  ? 'SSO is active. Team members will authenticate through your identity provider.'
                  : 'SSO is disabled. Team members authenticate with email and password.'}
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
        <h2 className="text-sm font-semibold text-gray-900 mb-1">
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
                className="btn-ghost gap-1.5 text-xs shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
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
                className="btn-ghost gap-1.5 text-xs shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                {copied === 'acsUrl' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Identity Provider configuration */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">
          Identity Provider (IdP) Configuration
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Enter the SAML 2.0 details from your identity provider (Okta, Azure AD, Google Workspace, etc.).
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
            <p className="text-xs text-gray-500 mt-1">
              The unique identifier for your identity provider. Also known as the Issuer.
            </p>
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
            <p className="text-xs text-gray-500 mt-1">
              The URL where ArchGuard will redirect users for authentication.
            </p>
          </div>

          <div>
            <label htmlFor="certificate" className="block text-sm font-medium text-gray-700 mb-1">
              X.509 Certificate
            </label>
            <textarea
              id="certificate"
              value={config.certificate}
              onChange={(e) => setConfig({ ...config, certificate: e.target.value })}
              placeholder={"-----BEGIN CERTIFICATE-----\nMIIDBzCCAe+gAwIBAgIJ...\n-----END CERTIFICATE-----"}
              className="input-field min-h-[160px] font-mono text-xs leading-relaxed"
            />
            <p className="text-xs text-gray-500 mt-1">
              Paste the full PEM-encoded X.509 certificate from your identity provider.
            </p>
          </div>
        </div>
      </div>

      {/* Provisioning Settings */}
      <div className="card-padded">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Provisioning Settings</h2>
        <p className="text-xs text-gray-500 mb-4">
          Configure how new users are provisioned when they first sign in through SSO.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="defaultRole" className="block text-sm font-medium text-gray-700 mb-1">
              Default Role
            </label>
            <select
              id="defaultRole"
              value={config.defaultRole}
              onChange={(e) =>
                setConfig({
                  ...config,
                  defaultRole: e.target.value as SSOConfig['defaultRole'],
                })
              }
              className="input-field w-64"
            >
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {roleOptions.find((r) => r.value === config.defaultRole)?.description}
            </p>
          </div>

          <div>
            <label
              htmlFor="allowedDomains"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Allowed Email Domains
            </label>
            <input
              id="allowedDomains"
              type="text"
              value={config.allowedDomains.join(', ')}
              onChange={(e) =>
                setConfig({
                  ...config,
                  allowedDomains: e.target.value
                    .split(',')
                    .map((d) => d.trim())
                    .filter(Boolean),
                })
              }
              placeholder="example.com, corp.example.com"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma-separated list of email domains allowed to sign in via SSO.
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
            Check our documentation for step-by-step guides on configuring SAML SSO with popular
            identity providers including Okta, Azure AD, Google Workspace, and OneLogin.
          </p>
        </div>
        <a href="#" className="btn-ghost text-blue-700 gap-1 text-xs shrink-0">
          <ExternalLink className="w-3.5 h-3.5" /> View Docs
        </a>
      </div>

      {/* Save button (bottom) */}
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
