'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  GitPullRequest,
  Gauge,
  ScrollText,
  FolderGit2,
  Users,
  AlertTriangle,
  Network,
  Settings,
  Shield,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OrgSwitcher } from './org-switcher';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const primaryNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Decisions', href: '/dashboard/decisions', icon: FileText },
  { label: 'Reviews', href: '/dashboard/reviews', icon: GitPullRequest },
  { label: 'Velocity', href: '/dashboard/velocity', icon: Gauge },
  { label: 'Summaries', href: '/dashboard/summaries', icon: ScrollText },
];

const secondaryNav: NavItem[] = [
  { label: 'Repos', href: '/dashboard/repos', icon: FolderGit2 },
  { label: 'Team', href: '/dashboard/team', icon: Users },
  { label: 'Drift', href: '/dashboard/drift', icon: AlertTriangle },
  { label: 'Dependencies', href: '/dashboard/dependencies', icon: Network },
];

const bottomNav: NavItem[] = [
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

  return (
    <Link
      href={item.href}
      className={cn(
        'sidebar-link group relative',
        isActive ? 'sidebar-link-active' : 'sidebar-link-inactive',
        collapsed && 'justify-center px-2',
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-brand-300' : 'text-slate-400')} />
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge && (
            <span className="ml-auto inline-flex items-center rounded-full bg-brand-500/20 px-2 py-0.5 text-2xs font-medium text-brand-300">
              {item.badge}
            </span>
          )}
        </>
      )}
      {collapsed && isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r bg-brand-400" />
      )}
    </Link>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex h-screen flex-col bg-sidebar-bg border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo & Org */}
      <div className={cn('flex items-center gap-3 border-b border-sidebar-border p-4', collapsed && 'justify-center p-3')}>
        <Shield className="h-7 w-7 text-brand-400 shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <span className="text-lg font-bold text-white">ArchGuard</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Org Switcher */}
      {!collapsed && (
        <div className="px-3 py-3 border-b border-sidebar-border">
          <OrgSwitcher />
        </div>
      )}

      {/* Primary Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
        <div className="space-y-1">
          {primaryNav.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} />
          ))}
        </div>

        {/* Section Divider */}
        <div className="my-4 border-t border-sidebar-border" />

        {!collapsed && (
          <p className="mb-2 px-3 text-2xs font-semibold uppercase tracking-wider text-slate-500">
            Workspace
          </p>
        )}

        <div className="space-y-1">
          {secondaryNav.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t border-sidebar-border px-3 py-3 space-y-1">
        {bottomNav.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} />
        ))}
        <button
          className={cn(
            'sidebar-link sidebar-link-inactive w-full text-red-400 hover:bg-red-500/10 hover:text-red-300',
            collapsed && 'justify-center px-2',
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
