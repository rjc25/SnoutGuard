'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Mail,
  MoreHorizontal,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  avatarUrl?: string;
  joinedAt: string;
  lastActiveAt: string;
  isActive: boolean;
}

const roleColors: Record<TeamMember['role'], string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  member: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600',
};

const roleIcons: Record<TeamMember['role'], typeof Shield> = {
  owner: Shield,
  admin: Shield,
  member: Users,
  viewer: Users,
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<TeamMember[]>('/team/members');
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch team members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const activeCount = members.filter((m) => m.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage team members and their roles.
          </p>
        </div>
        <Link href="/team/invite" className="btn-primary gap-2">
          <UserPlus className="w-4 h-4" /> Invite Member
        </Link>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-2xl font-bold text-gray-900">{members.length}</p>
            <p className="text-xs text-gray-500">Total Members</p>
          </div>
          <div className="card p-4">
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
            <p className="text-xs text-gray-500">Active</p>
          </div>
          <div className="card p-4">
            <p className="text-2xl font-bold text-gray-900">
              {members.filter((m) => m.role === 'admin' || m.role === 'owner').length}
            </p>
            <p className="text-xs text-gray-500">Admins</p>
          </div>
          <div className="card p-4">
            <p className="text-2xl font-bold text-gray-900">
              {members.filter((m) => m.role === 'viewer').length}
            </p>
            <p className="text-xs text-gray-500">Viewers</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card-padded text-center">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Members table */}
      {!loading && !error && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Member</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Role</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Joined</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Last Active</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const RoleIcon = roleIcons[member.role];
                  return (
                    <tr
                      key={member.id}
                      className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-xs shrink-0">
                            {member.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{member.name}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium capitalize',
                            roleColors[member.role],
                          )}
                        >
                          <RoleIcon className="w-3 h-3" />
                          {member.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs',
                            member.isActive ? 'text-green-600' : 'text-gray-400',
                          )}
                        >
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full',
                              member.isActive ? 'bg-green-500' : 'bg-gray-300',
                            )}
                          />
                          {member.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {formatRelativeTime(member.joinedAt)}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-xs">
                        {formatRelativeTime(member.lastActiveAt)}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {members.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              No team members found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
