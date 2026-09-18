'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Shield, LogOut, BookOpen, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useAuth } from '@/lib/authContext';

export default function ProfilePage() {
  const { t } = useLanguage();
  const { user, isAdmin, loading, refreshUser } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    await refreshUser();
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Profile Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
            <User className="w-10 h-10" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-100">{user.name}</h1>
              <span
                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                  user.role === 'ADMIN'
                    ? 'text-amber-300 bg-amber-500/20 border-amber-500/40'
                    : 'text-slate-400 bg-slate-800 border-slate-700'
                }`}
              >
                {user.role}
              </span>
            </div>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/bookshelf"
          className="p-4 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between group transition-all"
        >
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <span className="text-xs font-semibold text-slate-200">{t('myBookshelf')}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
        </Link>

        <Link
          href="/history"
          className="p-4 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between group transition-all"
        >
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-ocean-500" />
            <span className="text-xs font-semibold text-slate-200">{t('history')}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-ocean-500 transition-colors" />
        </Link>
      </div>

      {/* Admin Console Entry Banner */}
      {isAdmin && (
        <Link
          href="/admin"
          className="p-4 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent hover:border-amber-500/50 border border-amber-500/30 rounded-2xl flex items-center justify-between group transition-all shadow-lg shadow-amber-500/5"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-amber-300 block">{t('adminConsole')}</span>
              <span className="text-[11px] text-slate-400">ระบบจัดการหลังบ้าน, บันทึกกิจกรรม (Logs), นิยาย, สิทธิ์ และรายงาน</span>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition-transform" />
        </Link>
      )}

      {/* PWA & System Status */}
      <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{t('appStatusPwa')}</span>
        </div>
        <span className="text-[11px] text-amber-400 font-medium">v1.0.0</span>
      </div>

      {/* Logout Button at Bottom */}
      <div className="pt-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 active:scale-[0.99] border border-rose-500/30 rounded-2xl transition-all shadow-md shadow-rose-500/5"
        >
          <LogOut className="w-4 h-4" />
          <span>{t('logout')}</span>
        </button>
      </div>
    </div>
  );
}
