'use client';

import React from 'react';

export default function NovelCardSkeleton() {
  return (
    <div className="relative flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm animate-pulse">
      {/* Cover Skeleton with Badge Placeholder */}
      <div className="relative aspect-[3/4] w-full bg-slate-950 overflow-hidden">
        <div className="absolute inset-0 bg-slate-900/40" />
        
        {/* Top-left chapter count badge placeholder */}
        <div className="absolute top-1 left-1 w-10 h-3 bg-slate-800 rounded" />
      </div>

      {/* Content Info Skeletons */}
      <div className="flex-1 flex flex-col p-2 space-y-1.5">
        <div className="h-2.5 bg-slate-800/90 rounded w-4/5" />
        <div className="h-2 bg-slate-800/50 rounded w-1/2" />

        <div className="mt-auto pt-1 border-t border-slate-800/40 flex justify-between items-center">
          <div className="h-2 bg-slate-800/60 rounded w-1/3" />
          <div className="h-2 bg-slate-800/60 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

