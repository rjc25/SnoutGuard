'use client';

import {
  Activity,
  TrendingUp,
  TrendingDown,
  FileText,
  AlertTriangle,
  Gauge,
  GitPullRequest,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime, getHealthLevel, getHealthColor } from '@/lib/utils';

// --- Types ---

interface HealthScore {
  overall: number;
  coupling: number;
  cohesion: number;
  complexity: number;
  drift: number;
}

interface QuickStat {
  label: string;
  value: string;
  change: number;
  changeLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

interface ActivityItem {
  id: string;
  type: 'decision_discovered' | 'violation_detected' | 'review_completed' | 'drift_alert';
  title: string;
  description: string;
  timestamp: string;
  severity?: 'info' | 'warning' | 'error';
}

// --- Mock Data ---

const healthScore: HealthScore = {
  overall: 78,
  coupling: 82,
  cohesion: 74,
  complexity: 71,
  drift: 85,
};

const quickStats: QuickStat[] = [
  {
    label: 'Active Decisions',
    value: '142',
    change: 12,
    changeLabel: 'this month',
    icon: FileText,
    href: '/dashboard/decisions',
  },
  {
    label: 'Violation Trend',
    value: '23',
    change: -8,
    changeLabel: 'vs last week',
    icon: AlertTriangle,
    href: '/dashboard/drift',
  },
  {
    label: 'Velocity Score',
    value: '94',
    change: 3,
    changeLabel: 'vs last sprint',
    icon: Gauge,
    href: '/dashboard/velocity',
  },
  {
    label: 'Reviews This Week',
    value: '37',
    change: 15,
    changeLabel: 'vs last week',
    icon: GitPullRequest,
    href: '/dashboard/reviews',
  },
];

const recentActivity: ActivityItem[] = [
  {
    id: '1',
    type: 'decision_discovered',
    title: 'New decision inferred: Use CQRS for Order Service',
    description: 'AI detected a CQRS pattern emerging in the order-service module across 8 files.',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    severity: 'info',
  },
  {
    id: '2',
    type: 'violation_detected',
    title: 'Architectural violation in payments-api',
    description: 'Direct database access detected in controller layer, bypassing service pattern.',
    timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    severity: 'error',
  },
  {
    id: '3',
    type: 'review_completed',
    title: 'PR #289 review enrichment complete',
    description: 'Found 1 violation and 3 relevant architectural decisions for context.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    severity: 'info',
  },
  {
    id: '4',
    type: 'drift_alert',
    title: 'Drift detected in auth-module',
    description: 'Module coupling score dropped 12 points over the last 2 weeks.',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    severity: 'warning',
  },
  {
    id: '5',
    type: 'decision_discovered',
    title: 'Decision confirmed: Event-driven communication between services',
    description: 'Team lead confirmed the inferred decision with high confidence.',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    severity: 'info',
  },
];

// --- Components ---

function HealthScoreCard({ score }: { score: HealthScore }) {
  const level = getHealthLevel(score.overall);
  const colorClass = getHealthColor(score.overall);

  const dimensions = [
    { label: 'Coupling', value: score.coupling },
    { label: 'Cohesion', value: score.cohesion },
    { label: 'Complexity', value: score.complexity },
    { label: 'Drift', value: score.drift },
  ];

  return (
    <div className="card-padded col-span-full lg:col-span-1">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-brand-600" />
          <h3 className="text-sm font-semibold text-gray-900">Architectural Health</h3>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
            level === 'excellent' && 'bg-green-50 text-green-700',
            level === 'good' && 'bg-lime-50 text-lime-700',
            level === 'fair' && 'bg-yellow-50 text-yellow-700',
            level === 'poor' && 'bg-red-50 text-red-700',
          )}
        >
          {level}
        </span>
      </div>

      <div className="flex items-center justify-center mb-6">
        <div className="relative flex items-center justify-center">
          <svg className="h-32 w-32 -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${score.overall}, 100`}
              strokeLinecap="round"
              className={colorClass}
            />
          </svg>
          <div className="absolute text-center">
            <span className={cn('text-3xl font-bold', colorClass)}>{score.overall}</span>
            <span className="block text-xs text-gray-500">/ 100</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {dimensions.map((dim) => (
          <div key={dim.label} className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{dim.label}</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 rounded-full bg-gray-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    dim.value >= 80 ? 'bg-green-500' : dim.value >= 60 ? 'bg-yellow-500' : 'bg-red-500',
                  )}
                  style={{ width: `${dim.value}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-900 w-8 text-right">{dim.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickStatCard({ stat }: { stat: QuickStat }) {
  const isPositive = stat.change > 0;
  const TrendIcon = stat.label === 'Violation Trend' ? (isPositive ? TrendingUp : TrendingDown) : (isPositive ? TrendingUp : TrendingDown);
  const trendPositive = stat.label === 'Violation Trend' ? !isPositive : isPositive;

  return (
    <a href={stat.href} className="card-padded group hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="rounded-lg bg-gray-100 p-2 group-hover:bg-brand-50 transition-colors">
          <stat.icon className="h-5 w-5 text-gray-600 group-hover:text-brand-600 transition-colors" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
      <p className="mt-0.5 text-sm text-gray-600">{stat.label}</p>
      <div className="mt-3 flex items-center gap-1">
        <TrendIcon
          className={cn('h-3.5 w-3.5', trendPositive ? 'text-green-600' : 'text-red-600')}
        />
        <span className={cn('text-xs font-medium', trendPositive ? 'text-green-600' : 'text-red-600')}>
          {isPositive ? '+' : ''}{stat.change}
        </span>
        <span className="text-xs text-gray-500">{stat.changeLabel}</span>
      </div>
    </a>
  );
}

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const activityIcons: Record<ActivityItem['type'], React.ComponentType<{ className?: string }>> = {
    decision_discovered: FileText,
    violation_detected: XCircle,
    review_completed: CheckCircle2,
    drift_alert: AlertTriangle,
  };

  const severityColors: Record<string, string> = {
    info: 'bg-blue-100 text-blue-600',
    warning: 'bg-yellow-100 text-yellow-600',
    error: 'bg-red-100 text-red-600',
  };

  return (
    <div className="card col-span-full lg:col-span-2">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-brand-600" />
          <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
        </div>
        <a
          href="/dashboard/activity"
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          View all
        </a>
      </div>
      <div className="divide-y divide-gray-50">
        {items.map((item) => {
          const Icon = activityIcons[item.type];
          return (
            <div key={item.id} className="flex items-start gap-3 px-6 py-4 hover:bg-gray-50/50 transition-colors">
              <div
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  severityColors[item.severity || 'info'],
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.description}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 text-2xs text-gray-400">
                <Clock className="h-3 w-3" />
                <span>{formatRelativeTime(item.timestamp)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Page ---

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Overview of your organization&apos;s architectural health and recent activity.
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {quickStats.map((stat) => (
          <QuickStatCard key={stat.label} stat={stat} />
        ))}
      </div>

      {/* Health score + Activity feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <HealthScoreCard score={healthScore} />
        <ActivityFeed items={recentActivity} />
      </div>
    </div>
  );
}
