'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Mail, Send, Shield, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

type Role = 'admin' | 'member' | 'viewer';

interface InviteFormData {
  email: string;
  role: Role;
}

const roles: { value: Role; label: string; description: string; icon: typeof Shield }[] = [
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access to settings, can manage team members and integrations.',
    icon: Shield,
  },
  {
    value: 'member',
    label: 'Member',
    description: 'Can view and create decisions, reviews, and summaries.',
    icon: Users,
  },
  {
    value: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to dashboards and reports.',
    icon: Users,
  },
];

export default function InviteMemberPage() {
  const router = useRouter();
  const [form, setForm] = useState<InviteFormData>({ email: '', role: 'member' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.email.trim()) {
        setError('Email is required');
        return;
      }

      setSending(true);
      setError(null);
      try {
        await apiFetch('/team/invite', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        setSuccess(true);
        setTimeout(() => {
          router.push('/team');
        }, 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send invitation');
      } finally {
        setSending(false);
      }
    },
    [form, router],
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back link */}
      <Link href="/team" className="btn-ghost gap-2 inline-flex">
        <ArrowLeft className="w-4 h-4" /> Back to Team
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Invite Team Member</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send an invitation to join your organization.
        </p>
      </div>

      {/* Success message */}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="text-sm text-green-800">
            Invitation sent successfully! Redirecting to team page...
          </p>
        </div>
      )}

      {/* Form */}
      {!success && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email */}
          <div className="card-padded">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="colleague@company.com"
                className="input-field pl-9"
                required
              />
            </div>
          </div>

          {/* Role selection */}
          <div className="card-padded">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Role
            </label>
            <div className="space-y-3">
              {roles.map((role) => {
                const Icon = role.icon;
                const isSelected = form.role === role.value;
                return (
                  <label
                    key={role.value}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors',
                      isSelected
                        ? 'border-brand-600 bg-brand-50/50'
                        : 'border-gray-200 hover:border-gray-300',
                    )}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.value}
                      checked={isSelected}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, role: e.target.value as Role }))
                      }
                      className="mt-0.5 h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon
                          className={cn(
                            'w-4 h-4',
                            isSelected ? 'text-brand-600' : 'text-gray-400',
                          )}
                        />
                        <span className="text-sm font-semibold text-gray-900">{role.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{role.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={sending} className="btn-primary gap-2">
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : 'Send Invitation'}
            </button>
            <Link href="/team" className="btn-ghost">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
