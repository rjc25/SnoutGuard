'use client';

import Link from 'next/link';
import { Calendar, FileText, User } from 'lucide-react';
import { cn, formatDate, truncate } from '@/lib/utils';

export interface SummaryData {
  id: string;
  title: string;
  type: 'daily' | 'weekly' | 'sprint' | 'custom';
  developerName?: string;
  period: {
    start: string;
    end: string;
  };
  preview: string;
  createdAt: string;
}

interface SummaryCardProps {
  summary: SummaryData;
}

const typeColors: Record<SummaryData['type'], string> = {
  daily: 'bg-blue-100 text-blue-700',
  weekly: 'bg-purple-100 text-purple-700',
  sprint: 'bg-green-100 text-green-700',
  custom: 'bg-gray-100 text-gray-700',
};

export function SummaryCard({ summary }: SummaryCardProps) {
  return (
    <Link href={`/summaries/${summary.id}`} className="block">
      <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <h3 className="text-sm font-semibold text-gray-900 truncate">{summary.title}</h3>
            </div>
            <p className="text-xs text-gray-500 mt-2 line-clamp-2">
              {truncate(summary.preview, 150)}
            </p>
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium shrink-0 capitalize',
              typeColors[summary.type],
            )}
          >
            {summary.type}
          </span>
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(summary.period.start)} - {formatDate(summary.period.end)}
          </span>
          {summary.developerName && (
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {summary.developerName}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
