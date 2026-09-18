import React from 'react';
import Link from 'next/link';
import { BookOpen, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-5 max-w-md mx-auto">
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
        <BookOpen className="w-10 h-10" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-slate-100">404 - ไม่พบหน้าที่ต้องการ</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          หน้าที่คุณกำลังค้นหาอาจถูกย้าย ลบ หรือยังไม่มีในระบบ
        </p>
      </div>
      <Link
        href="/"
        className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md"
      >
        <Home className="w-3.5 h-3.5" /> กลับหน้าหลัก
      </Link>
    </div>
  );
}
