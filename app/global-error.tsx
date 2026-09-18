'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full text-center space-y-4">
          <h2 className="text-lg font-bold text-slate-100">เกิดข้อผิดพลาดของระบบ (System Error)</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error?.message || 'เกิดข้อผิดพลาดร้ายแรง กรุณาลองรีโหลดหน้านี้อีกครั้ง'}
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all"
          >
            รีโหลดหน้าเว็บ
          </button>
        </div>
      </body>
    </html>
  );
}
