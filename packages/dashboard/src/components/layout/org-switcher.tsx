'use client';

import { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'team' | 'enterprise';
}

const mockOrgs: Organization[] = [
  { id: '1', name: 'Acme Corp', slug: 'acme-corp', plan: 'enterprise' },
  { id: '2', name: 'Personal', slug: 'personal', plan: 'free' },
  { id: '3', name: 'Side Project', slug: 'side-project', plan: 'team' },
];

const planBadgeColors: Record<string, string> = {
  free: 'bg-gray-100 text-gray-600',
  team: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
};

export function OrgSwitcher() {
  const [open, setOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization>(mockOrgs[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
          'hover:bg-slate-800',
          open && 'bg-slate-800',
        )}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-white text-xs font-bold shrink-0">
          {selectedOrg.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-white">{selectedOrg.name}</p>
          <p className="truncate text-2xs text-slate-400">{selectedOrg.slug}</p>
        </div>
        <ChevronDown
          className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 rounded-lg bg-slate-800 shadow-lg ring-1 ring-white/10 z-50 animate-slide-up">
          <div className="px-2 py-1.5">
            <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-slate-500">
              Organizations
            </p>
            {mockOrgs.map((org) => (
              <button
                key={org.id}
                onClick={() => {
                  setSelectedOrg(org);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors',
                  selectedOrg.id === org.id
                    ? 'bg-brand-600/20 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                )}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-700 text-white text-xs font-bold shrink-0">
                  {org.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{org.name}</p>
                  <span
                    className={cn(
                      'inline-block rounded px-1.5 py-0.5 text-2xs font-medium capitalize',
                      planBadgeColors[org.plan],
                    )}
                  >
                    {org.plan}
                  </span>
                </div>
                {selectedOrg.id === org.id && <Check className="h-4 w-4 text-brand-400 shrink-0" />}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-700 px-2 py-1.5">
            <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
              <Plus className="h-4 w-4" />
              Create organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
