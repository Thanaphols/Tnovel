'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Mail, Lock, BookOpen, ArrowRight, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

export default function RegisterPage() {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState('/');
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const cb = params.get('callbackUrl');
    if (cb && cb.startsWith('/')) {
      setCallbackUrl(cb);
    }

    let err = params.get('error');
    if (!err && window.location.search) {
      const match = window.location.search.match(/[?&]error=([^&]+)/);
      if (match && match[1]) {
        try {
          err = decodeURIComponent(match[1].replace(/\+/g, ' '));
        } catch {
          err = match[1];
        }
      }
    }

    if (err) {
      setError(err);
    }
  }, []);

  const handleCloseErrorModal = () => {
    setError(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      const params = new URLSearchParams(window.location.search);
      const callback = params.get('callbackUrl');
      const target = callback && callback.startsWith('/') ? callback : '/';

      router.push(target);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl mb-1">
            <BookOpen className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100">{t('registerTitle')}</h1>
          <p className="text-xs text-slate-400">{t('registerSubtitle')}</p>
        </div>

      {/* Modal Alert Popup */}
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm sm:max-w-md p-6 sm:p-7 bg-slate-900 border border-slate-700/90 rounded-3xl shadow-2xl space-y-5 text-center animate-scale-up relative">
            {/* Top Warning Icon */}
            <div className="inline-flex p-3.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-2xl">
              <AlertCircle className="w-8 h-8 sm:w-9 sm:h-9" />
            </div>

            {/* Modal Title & Body */}
            <div className="space-y-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-100">
                {t('authAlertTitle')}
              </h3>
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-300 leading-relaxed break-words text-left max-h-60 overflow-y-auto">
                {error}
              </div>
            </div>

            {/* Action Button */}
            <button
              type="button"
              onClick={handleCloseErrorModal}
              className="w-full py-2.5 px-4 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
            >
              {t('btnUnderstand')}
            </button>
          </div>
        </div>
      )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('nameLabel')}</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                required
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('emailLabel')}</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">{t('passwordLabel')}</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                required
                minLength={6}
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs sm:text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
          >
            {loading ? t('registering') : t('registerTitle')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Divider with perfectly centered text */}
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 border-t border-slate-800" />
          <span className="text-[11px] text-slate-500 uppercase tracking-wider shrink-0 font-medium">
            {t('orDivider')}
          </span>
          <div className="flex-1 border-t border-slate-800" />
        </div>

        {/* Google OAuth Register Button */}
        <a
          href={`/api/auth/google${callbackUrl !== '/' ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`}
          className="google-auth-btn w-full flex items-center justify-center gap-3 py-2.5 px-4 text-xs sm:text-sm font-semibold text-slate-200 bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl transition-all shadow-sm active:scale-[0.99]"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{t('continueWithGoogle')}</span>
        </a>

        <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800/80">
          {t('alreadyHaveAccount')}{' '}
          <Link
            href={callbackUrl !== '/' ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login'}
            className="font-semibold text-ocean-600 dark:text-ocean-400 hover:underline"
          >
            {t('loginHere')}
          </Link>
        </div>
      </div>
    </div>
  );
}
