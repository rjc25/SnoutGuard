'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  MessageSquare,
  RefreshCw,
  Settings,
  XCircle,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface Integration {
  id: string;
  provider: 'github' | 'bitbucket' | 'slack';
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt?: string;
  configUrl?: string;
}

const providerIcons: Record<string, typeof GitBranch> = {
  github: GitBranch,
  bitbucket: GitBranch,
  slack: MessageSquare,
};

const providerColors: Record<string, string> = {
  github: 'bg-gray-900 text-white',
  bitbucket: 'bg-blue-600 text-white',
  slack: 'bg-purple-600 text-white',
};

const statusConfig: Record<
  Integration['status'],
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  connected: {
    icon: CheckCircle2,
    color: 'text-green-600',
    label: 'Connected',
  },
  disconnected: {
    icon: XCircle,
    color: 'text-gray-400',
    label: 'Not Connected',
  },
  error: {
    icon: XCircle,
    color: 'text-red-600',
    label: 'Connection Error',
  },
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Integration[]>('/settings/integrations');
      setIntegrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleConnect = useCallback(
    async (integrationId: string) => {
      setConnecting(integrationId);
      try {
        const updated = await apiFetch<Integration>(
          `/settings/integrations/${integrationId}/connect`,
          { method: 'POST' },
        );
        setIntegrations((prev) =>
          prev.map((i) => (i.id === integrationId ? updated : i)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect integration');
      } finally {
        setConnecting(null);
      }
    },
    [],
  );

  const handleDisconnect = useCallback(
    async (integrationId: string) => {
      setConnecting(integrationId);
      try {
        const updated = await apiFetch<Integration>(
          `/settings/integrations/${integrationId}/disconnect`,
          { method: 'POST' },
        );
        setIntegrations((prev) =>
          prev.map((i) => (i.id === integrationId ? updated : i)),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to disconnect integration');
      } finally {
        setConnecting(null);
      }
    },
    [],
  );

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
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect your development tools to enable automated reviews and notifications.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Integration cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((integration) => {
          const Icon = providerIcons[integration.provider] || Settings;
          const status = statusConfig[integration.status];
          const StatusIcon = status.icon;
          const isProcessing = connecting === integration.id;

          return (
            <div key={integration.id} className="card p-6 flex flex-col">
              {/* Provider icon and name */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    providerColors[integration.provider] || 'bg-gray-200 text-gray-700',
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{integration.name}</h3>
                  <div className={cn('flex items-center gap-1 text-xs', status.color)}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.label}
                  </div>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-gray-500 flex-1">{integration.description}</p>

              {/* Connected info */}
              {integration.connectedAt && integration.status === 'connected' && (
                <p className="text-2xs text-gray-400 mt-3">
                  Connected {formatRelativeTime(integration.connectedAt)}
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                {integration.status === 'connected' ? (
                  <>
                    {integration.configUrl && (
                      <a
                        href={integration.configUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost gap-1 text-xs flex-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Configure
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDisconnect(integration.id)}
                      disabled={isProcessing}
                      className="btn-ghost text-red-600 hover:text-red-700 text-xs flex-1 gap-1"
                    >
                      {isProcessing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(integration.id)}
                    disabled={isProcessing}
                    className="btn-primary text-xs w-full gap-1"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    {isProcessing ? 'Connecting...' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {integrations.length === 0 && !error && (
          <div className="col-span-full card-padded text-center py-12 text-gray-400 text-sm">
            No integrations available.
          </div>
        )}
      </div>
    </div>
  );
}
