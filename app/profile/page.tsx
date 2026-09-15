'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Shield, LogOut, BookOpen, Clock, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

export default function ProfilePage() {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
      } else {
        router.push('/login');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
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
          href="/bin"
          className="p-4 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between group transition-all"
        >
          <div className="flex items-center gap-2.5">
            <Trash2 className="w-5 h-5 text-rose-400" />
            <span className="text-xs font-semibold text-slate-200">{t('recycleBinTitle')}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
        </Link>

        {user.role === 'ADMIN' && (
          <Link
            href="/admin"
            className="p-4 bg-slate-900/60 hover:bg-slate-900 border border-amber-500/30 rounded-2xl flex items-center justify-between group transition-all"
          >
            <div className="flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-300">{t('adminDashboard')}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-400 group-hover:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>

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
