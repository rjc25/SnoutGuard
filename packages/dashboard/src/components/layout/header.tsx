'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, Bell, ChevronDown, User, Settings, LogOut, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  orgName?: string;
}

export function Header({ orgName = 'My Organization' }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      {/* Left section - breadcrumb / org name */}
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-semibold text-gray-900">{orgName}</h2>
      </div>

      {/* Center - search */}
      <div className="flex-1 max-w-xl mx-8">
        <div className="relative">
          <Search
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
              searchFocused ? 'text-brand-500' : 'text-gray-400',
            )}
          />
          <input
            type="text"
            placeholder="Search decisions, repos, reviews..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className={cn(
              'w-full rounded-lg border bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 transition-all',
              searchFocused
                ? 'border-brand-300 bg-white ring-2 ring-brand-100'
                : 'border-gray-200 hover:border-gray-300',
            )}
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-100 px-1.5 text-2xs font-medium text-gray-400">
            /
          </kbd>
        </div>
      </div>

      {/* Right section - notifications & user menu */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div ref={notificationsRef} className="relative">
          <button
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setUserMenuOpen(false);
            }}
            className="relative rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white shadow-lg ring-1 ring-gray-950/5 animate-slide-up">
              <div className="border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {[
                  {
                    title: 'New architectural drift detected',
                    desc: 'Service layer is bypassing repository pattern in 3 files.',
                    time: '5m ago',
                    unread: true,
                  },
                  {
                    title: 'Decision confirmed',
                    desc: '"Use Repository Pattern for data access" was confirmed by team lead.',
                    time: '1h ago',
                    unread: true,
                  },
                  {
                    title: 'Review completed',
                    desc: 'PR #142 review enrichment complete -- 2 violations found.',
                    time: '3h ago',
                    unread: false,
                  },
                ].map((notification) => (
                  <div
                    key={notification.title}
                    className={cn(
                      'border-b border-gray-50 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors',
                      notification.unread && 'bg-brand-50/30',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {notification.unread && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                      )}
                      <div className={cn(!notification.unread && 'ml-4')}>
                        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{notification.desc}</p>
                        <p className="mt-1 text-2xs text-gray-400">{notification.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 px-4 py-2">
                <button className="w-full text-center text-xs font-medium text-brand-600 hover:text-brand-700">
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => {
              setUserMenuOpen(!userMenuOpen);
              setNotificationsOpen(false);
            }}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-100 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-semibold text-sm">
              JD
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-gray-900 leading-none">Jane Doe</p>
              <p className="text-2xs text-gray-500">{orgName}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-lg ring-1 ring-gray-950/5 animate-slide-up">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">Jane Doe</p>
                <p className="text-xs text-gray-500">jane@company.com</p>
              </div>
              <div className="py-1">
                {[
                  { icon: User, label: 'Profile', href: '/dashboard/settings/profile' },
                  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
                  { icon: HelpCircle, label: 'Help & Support', href: '#' },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <item.icon className="h-4 w-4 text-gray-400" />
                    {item.label}
                  </a>
                ))}
              </div>
              <div className="border-t border-gray-100 py-1">
                <button className="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
