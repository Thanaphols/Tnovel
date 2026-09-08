'use client';

import React from 'react';

export default function NovelCardSkeleton() {
  return (
    <div className="relative flex flex-col bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-md animate-pulse">
      {/* Cover Skeleton with Badge Placeholder */}
      <div className="relative aspect-[3/4] w-full bg-slate-950/90 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 via-slate-800/20 to-slate-900/60" />
        
        {/* Top-left chapter count badge placeholder */}
        <div className="absolute top-2 left-2 w-14 h-4 bg-slate-800/80 rounded-lg" />
      </div>

      {/* Content Info Skeletons */}
      <div className="flex-1 flex flex-col p-3 space-y-2.5">
        <div className="space-y-1.5">
          <div className="h-3.5 bg-slate-800/90 rounded-md w-full" />
          <div className="h-3.5 bg-slate-800/60 rounded-md w-2/3" />
        </div>
        
        <div className="h-3 bg-slate-800/50 rounded-md w-1/2" />

        <div className="mt-auto pt-2">
          <div className="h-7 bg-amber-500/10 border border-amber-500/10 rounded-xl w-full" />
        </div>
      </div>
    </div>
  );
}

