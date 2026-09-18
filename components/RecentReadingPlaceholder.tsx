'use client';

import React from 'react';
import { History } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

export default function RecentReadingPlaceholder() {
  const { t } = useLanguage();

  return (
    <div className="space-y-3 pt-2">
      {/* Header with Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
          <History className="w-5 h-5 text-amber-400" />
          <span>{t('recentReadingTitle')}</span>
        </h2>
      </div>

      {/* Empty State Text */}
      <div className="h-[98px] sm:h-[114px] px-4 bg-slate-900/40 border border-slate-800/60 rounded-xl text-xs sm:text-sm text-slate-400 flex items-center gap-2.5">
        <History className="w-4 h-4 text-slate-500 shrink-0" />
        <span>{t('noRecentReading')}</span>
      </div>
    </div>
  );
}
