'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Plus, User, Shield, LogIn, Wifi, WifiOff, Home, History, Library } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useAuth } from '@/lib/authContext';
import UrlScrapeDrawer from './UrlScrapeDrawer';
import SettingsDropdown from './SettingsDropdown';

export default function Navbar() {
  const [isScrapeOpen, setIsScrapeOpen] = useState(false);
  const { user, isAdmin } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const pathname = usePathname();
  const { t } = useLanguage();

  useEffect(() => {
    // Network online/offline status
    function updateOnlineStatus() {
      setIsOnline(navigator.onLine);
    }
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  // Track last visited non-reader page for smart reader back navigation
  useEffect(() => {
    if (
      pathname &&
      !pathname.startsWith('/reader') &&
      !pathname.startsWith('/api') &&
      pathname !== '/login' &&
      pathname !== '/register'
    ) {
      try {
        sessionStorage.setItem('tnovel_reader_return_url', pathname);
        sessionStorage.setItem('tnovel_prev_non_reader_url', pathname);
      } catch {}
    }
  }, [pathname]);

  // Hide global navbar in reader mode, auth pages, and admin portal
  if (pathname?.startsWith('/reader') || pathname === '/login' || pathname === '/register' || pathname?.startsWith('/admin')) {
    return isAdmin ? <UrlScrapeDrawer isOpen={isScrapeOpen} onClose={() => setIsScrapeOpen(false)} /> : null;
  }

  const isHome = pathname === '/';
  const isBookshelf = pathname === '/bookshelf';
  const isHistory = pathname === '/history';
  const isProfile = pathname === '/profile' || pathname === '/login' || pathname === '/register';

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
            <div className="p-1.5 sm:p-2 bg-amber-400 rounded-xl text-slate-950 shadow-sm group-hover:scale-105 transition-transform">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 font-bold" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-100 group-hover:text-amber-400 transition-colors">
                {t('appTitle')}
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold text-ocean-600 dark:text-ocean-400 bg-ocean-500/10 border border-ocean-500/20 px-1.5 py-0.5 rounded-md">
                PWA
              </span>
            </div>
          </Link>

          {/* Action & Nav Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Online/Offline status badge (Desktop only) */}
            <div
              className={`hidden sm:flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${
                isOnline
                  ? 'text-forest-600 dark:text-forest-400 bg-forest-500/10 border-forest-500/20'
                  : 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? t('online') : t('offline')}</span>
            </div>

            {/* Combined Theme & Language Settings Dropdown */}
            <SettingsDropdown />

            {/* Desktop Only Buttons */}
            <div className="hidden md:flex items-center gap-2">
              {/* Translate URL Button (Admin only) */}
              {isAdmin && (
                <button
                  onClick={() => setIsScrapeOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-95 rounded-xl shadow-md shadow-amber-500/20 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('translateNovel')}</span>
                </button>
              )}

              {/* Bookshelf Link */}
              <Link
                href="/bookshelf"
                className={`p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-xl transition-colors ${
                  isBookshelf ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' : ''
                }`}
                title={t('myBookshelf')}
              >
                <Library className="w-4 h-4" />
              </Link>

              {/* Translation History Link */}
              <Link
                href="/history"
                className={`p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-xl transition-colors ${
                  isHistory ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' : ''
                }`}
                title={t('history')}
              >
                <History className="w-4 h-4" />
              </Link>

              {/* Admin Console (If Admin) */}
              {isAdmin && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl transition-all shadow-sm"
                  title={t('adminConsole')}
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden lg:inline">{t('adminConsole')}</span>
                </Link>
              )}

              {/* User Profile / Auth */}
              {user ? (
                <Link
                  href="/profile"
                  className={`flex items-center gap-1.5 p-1.5 pl-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all ${
                    pathname === '/profile' ? 'border-amber-500/40 text-amber-300' : ''
                  }`}
                >
                  <User className="w-4 h-4 text-amber-400" />
                  <span className="max-w-[80px] truncate">{user.name}</span>
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t('login')}</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile-First Bottom Navigation Bar */}
      <nav className="flex md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 px-8 py-2.5 justify-between items-center shadow-2xl safe-area-bottom">
        {/* Tab 1: Home */}
        <Link
          href="/"
          className={`p-2 rounded-2xl transition-all ${
            isHome ? 'text-amber-400 bg-amber-500/15 scale-110 shadow-sm' : 'text-slate-400 hover:text-slate-200 active:scale-95'
          }`}
          title={t('library')}
        >
          <Home className="w-5 h-5" />
        </Link>

        {/* Tab 2: Bookshelf */}
        <Link
          href="/bookshelf"
          className={`p-2 rounded-2xl transition-all ${
            isBookshelf ? 'text-amber-400 bg-amber-500/15 scale-110 shadow-sm' : 'text-slate-400 hover:text-slate-200 active:scale-95'
          }`}
          title={t('myBookshelf')}
        >
          <Library className="w-5 h-5" />
        </Link>

        {/* Center Floating Action Button: + Translate (Admin only) */}
        {isAdmin && (
          <button
            onClick={() => setIsScrapeOpen(true)}
            className="-mt-6 p-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg active:scale-95 transition-all flex items-center justify-center border-2 border-slate-950"
            title={t('translateNovel')}
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>
        )}

        {/* Tab 4: History */}
        <Link
          href="/history"
          className={`p-2 rounded-2xl transition-all ${
            isHistory ? 'text-amber-400 bg-amber-500/15 scale-110 shadow-sm' : 'text-slate-400 hover:text-slate-200 active:scale-95'
          }`}
          title={t('history')}
        >
          <History className="w-5 h-5" />
        </Link>

        {/* Tab 5: Profile / Login */}
        <Link
          href={user ? '/profile' : '/login'}
          className={`p-2 rounded-2xl transition-all ${
            isProfile ? 'text-amber-400 bg-amber-500/15 scale-110 shadow-sm' : 'text-slate-400 hover:text-slate-200 active:scale-95'
          }`}
          title={user ? t('profile') : t('login')}
        >
          {user ? <User className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
        </Link>
      </nav>

      {/* URL Scraper Modal (Admin only) */}
      {isAdmin && <UrlScrapeDrawer isOpen={isScrapeOpen} onClose={() => setIsScrapeOpen(false)} />}
    </>
  );
}
