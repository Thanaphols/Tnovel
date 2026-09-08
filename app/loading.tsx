import React from 'react';
import { Loader2, Sparkles, BookOpen } from 'lucide-react';
import NovelCardSkeleton from '@/components/NovelCardSkeleton';

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      {/* Header Banner Skeleton */}
      <div className="relative p-6 sm:p-8 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-full">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
          <span>กำลังเชื่อมต่อคลังนิยาย...</span>
        </div>
        <div className="h-8 bg-slate-800/60 rounded-2xl w-2/3 sm:w-1/2 animate-pulse" />
        <div className="h-4 bg-slate-800/40 rounded-xl w-4/5 sm:w-1/3 animate-pulse" />
        
        {/* Search Bar Skeleton */}
        <div className="pt-2 max-w-md">
          <div className="h-10 bg-slate-950/80 border border-slate-800/80 rounded-xl w-full animate-pulse" />
        </div>
      </div>

      {/* Grid Header & Centered Circle Loader */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-500/50" />
            <div className="h-5 bg-slate-800/80 rounded-lg w-32 animate-pulse" />
          </div>
        </div>

        {/* Centered Circular Loading Screen */}
        <div className="min-h-[380px] flex flex-col items-center justify-center p-8 bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-4 shadow-xl">
          <div className="relative flex items-center justify-center">
            {/* Glowing Aura */}
            <div className="absolute w-24 h-24 bg-amber-500/20 rounded-full blur-2xl animate-pulse" />
            {/* Outer Spin Ring */}
            <div className="w-16 h-16 border-4 border-slate-800 border-t-amber-400 border-r-amber-400/50 rounded-full animate-spin" />
            {/* Inner Center Icon */}
            <div className="absolute inset-0 flex items-center justify-center text-amber-400">
              <BookOpen className="w-6 h-6 animate-pulse" />
            </div>
          </div>

          <div className="text-center space-y-1 pt-1">
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              กำลังโหลดคลังนิยาย...
            </h3>
            <p className="text-xs text-slate-400">
              กรุณารอสักครู่ กำลังดึงรายการนิยายแปลไทย
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
