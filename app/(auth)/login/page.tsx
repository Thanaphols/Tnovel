'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogIn, Mail, Lock, BookOpen, ArrowRight, AlertCircle, Send, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

export default function LoginPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callbackUrl, setCallbackUrl] = useState('/');
  const router = useRouter();

  // Invite Request States
  const [isUnauthorized, setIsUnauthorized] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteAvatar, setInviteAvatar] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const cb = params.get('callbackUrl');
    if (cb && cb.startsWith('/')) {
      setCallbackUrl(cb);
    }

    const emailParam = params.get('email');
    const nameParam = params.get('name');
    const avatarParam = params.get('avatar');

    if (emailParam) setInviteEmail(emailParam);
    if (nameParam) setInviteName(nameParam);
    if (avatarParam) setInviteAvatar(avatarParam);

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
      if (
        err === 'UNAUTHORIZED_GOOGLE' ||
        err.includes('ไม่มีสิทธ์') ||
        err.includes('ไม่มีสิทธิ์') ||
        emailParam
      ) {
        setIsUnauthorized(true);
      }
    }
  }, []);

  const handleCloseErrorModal = () => {
    setError(null);
    setIsUnauthorized(false);
    setInviteSuccess(false);
    setInviteMessage('');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('email');
      url.searchParams.delete('name');
      url.searchParams.delete('avatar');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  };

  async function handleSendInvite() {
    const targetEmail = (inviteEmail || email).trim();
    if (!targetEmail) return;

    setSendingInvite(true);
    try {
      const res = await fetch('/api/auth/invite-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          name: inviteName || undefined,
          avatar: inviteAvatar || undefined,
          note: inviteNote || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setInviteSuccess(true);
        setInviteMessage(data.message || t('inviteRequestSuccessDesc'));
      } else {
        alert(data.error || 'ไม่สามารถส่งคำขอได้');
      }
    } catch (err: any) {
      alert(err.message || t('networkError'));
    } finally {
      setSendingInvite(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!data.success) {
        if (data.unauthorized) {
          setIsUnauthorized(true);
          setInviteEmail(data.email || email);
          setError(data.error || 'คุณไม่มีสิทธิ์ใช้งานระบบได้ กรุณาติดต่อผู้ดูแลระบบ');
          return;
        }
        throw new Error(data.error || t('networkError'));
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
          <h1 className="text-2xl font-extrabold text-slate-100">{t('loginTitle')}</h1>
          <p className="text-xs text-slate-400">{t('loginSubtitle')}</p>
        </div>

      {/* Modal Alert Popup */}
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm sm:max-w-md p-6 sm:p-7 bg-slate-900 border border-slate-700/90 rounded-3xl shadow-2xl space-y-5 text-center animate-scale-up relative">
            {isUnauthorized ? (
              inviteSuccess ? (
                /* Success State */
                <>
                  <div className="inline-flex p-3.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-2xl">
                    <CheckCircle2 className="w-8 h-8 sm:w-9 sm:h-9" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-100">
                      {t('inviteRequestSuccess')}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {inviteMessage || t('inviteRequestSuccessDesc')}
                    </p>
                    {inviteEmail && (
                      <div className="inline-block mt-2 px-3 py-1 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono text-amber-400">
                        {inviteEmail}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCloseErrorModal}
                    className="w-full py-2.5 px-4 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    {t('btnUnderstand')}
                  </button>
                </>
              ) : (
                /* Unauthorized + Request Invite State */
                <>
                  <div className="inline-flex p-3.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-2xl">
                    <AlertCircle className="w-8 h-8 sm:w-9 sm:h-9" />
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-base sm:text-lg font-bold text-slate-100">
                      {t('inviteRequestTitle')}
                    </h3>

                    {/* User Profile Card if available */}
                    {(inviteEmail || inviteName || inviteAvatar) && (
                      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center gap-3 text-left">
                        {inviteAvatar ? (
                          <img
                            src={inviteAvatar}
                            alt="Avatar"
                            className="w-10 h-10 rounded-full border border-slate-700 object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center flex-shrink-0 text-sm">
                            {(inviteName || inviteEmail || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          {inviteName && (
                            <p className="text-xs font-bold text-slate-200 truncate">{inviteName}</p>
                          )}
                          <p className="text-[11px] font-mono text-slate-400 truncate">{inviteEmail}</p>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-slate-300 leading-relaxed text-left">
                      {t('inviteRequestDesc')}
                    </p>

                    {/* Email input if missing */}
                    {!inviteEmail && (
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="ระบุอีเมลของคุณ..."
                        className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
                      />
                    )}

                    {/* Optional Note */}
                    <input
                      type="text"
                      value={inviteNote}
                      onChange={(e) => setInviteNote(e.target.value)}
                      placeholder={t('inviteRequestNotePlaceholder')}
                      className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleCloseErrorModal}
                      className="flex-1 py-2.5 px-3 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-all"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSendInvite}
                      disabled={sendingInvite || !(inviteEmail || email)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {sendingInvite ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{t('inviteRequestSending')}</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>{t('inviteRequestBtn')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )
            ) : (
              /* Standard Error Modal */
              <>
                <div className="inline-flex p-3.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-2xl">
                  <AlertCircle className="w-8 h-8 sm:w-9 sm:h-9" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-base sm:text-lg font-bold text-slate-100">
                    {t('authAlertTitle')}
                  </h3>
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-300 leading-relaxed break-words text-left max-h-60 overflow-y-auto">
                    {error}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseErrorModal}
                  className="w-full py-2.5 px-4 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  {t('btnUnderstand')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="••••••••"
                required
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 text-xs sm:text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
          >
            {loading ? t('loggingIn') : t('login')}
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

        {/* Google OAuth Login Button */}
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
          <span>{t('loginWithGoogle')}</span>
        </a>

        <div className="text-center text-xs text-slate-400 pt-2 border-t border-slate-800/80">
          {t('noAccountYet')}{' '}
          <Link
            href={callbackUrl !== '/' ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/register'}
            className="font-semibold text-ocean-600 dark:text-ocean-400 hover:underline"
          >
            {t('registerHere')}
          </Link>
        </div>
      </div>
    </div>
  );
}
