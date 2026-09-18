'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error caught by error boundary:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-5 max-w-md mx-auto">
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl">
        <AlertCircle className="w-10 h-10" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-slate-100">เกิดข้อผิดพลาดในการแสดงผล</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          {error?.message || 'ระบบไม่สามารถโหลดหน้านี้ได้ กรุณาลองใหม่อีกครั้ง'}
        </p>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md"
        >
          <RotateCcw className="w-3.5 h-3.5" /> ลองใหม่อีกครั้ง
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-300 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-xl transition-colors"
        >
          <Home className="w-3.5 h-3.5" /> หน้าหลัก
        </Link>
      </div>
    </div>
  );
}
