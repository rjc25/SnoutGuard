'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Shield, Building2, Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import { initiateSSOLogin } from '@/lib/auth';

export default function SSOPage() {
  const [orgSlug, setOrgSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const slug = orgSlug.trim().toLowerCase().replace(/\s+/g, '-');

    if (!slug) {
      setError('Please enter your organization identifier.');
      setLoading(false);
      return;
    }

    try {
      initiateSSOLogin(slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate SSO. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center rounded-full bg-brand-100 p-3 mb-4">
            <KeyRound className="h-8 w-8 text-brand-600" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-7 w-7 text-brand-600" />
            <span className="text-xl font-bold text-gray-900">ArchGuard</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Enterprise Single Sign-On</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sign in using your organization&apos;s SAML identity provider.
          </p>
        </div>

        {/* SSO form */}
        <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-gray-950/5">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="org-slug" className="block text-sm font-medium text-gray-700 mb-1.5">
                Organization identifier
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  id="org-slug"
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="your-organization"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                This is the unique slug for your organization. Contact your admin if you&apos;re unsure.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !orgSlug.trim()}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting to SSO...
                </>
              ) : (
                <>
                  Continue with SSO
                  <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-medium text-gray-900">How does SSO work?</h3>
            <ol className="mt-2 space-y-1.5 text-xs text-gray-600">
              <li className="flex gap-2">
                <span className="font-medium text-brand-600">1.</span>
                Enter your organization identifier above.
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-brand-600">2.</span>
                You&apos;ll be redirected to your identity provider (Okta, Azure AD, etc.).
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-brand-600">3.</span>
                After authentication, you&apos;ll be signed in automatically.
              </li>
            </ol>
          </div>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
