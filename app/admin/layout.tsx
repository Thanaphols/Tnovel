'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Shield,
  LayoutDashboard,
  ScrollText,
  BookOpen,
  Users,
  MailCheck,
  AlertCircle,
  Trash2,
  ArrowLeft,
  Activity,
  Plus,
  Loader2,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useSocket } from '@/lib/socket';
import UrlScrapeDrawer from '@/components/UrlScrapeDrawer';
import SettingsDropdown from '@/components/SettingsDropdown';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { isConnected } = useSocket();

  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isScrapeOpen, setIsScrapeOpen] = useState(false);
  const [pendingReportsCount, setPendingReportsCount] = useState(0);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user && data.user.role === 'ADMIN') {
          setUser(data.user);
        } else {
          router.push('/?unauthorized=admin');
        }
      })
      .catch(() => router.push('/?unauthorized=admin'))
      .finally(() => setAuthLoading(false));

    // Fetch pending reports badge count
    fetch('/api/admin/reports')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.reports)) {
          const count = data.reports.filter((r: any) => r.status === 'PENDING').length;
          setPendingReportsCount(count);
        }
      })
      .catch(() => {});
  }, [router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
        <p className="text-xs text-slate-400 font-medium">กำลังตรวจสอบสิทธิ์ผู้ดูแลระบบ...</p>
      </div>
    );
  }

  if (!user) return null;

  const navItems = [
    {
      href: '/admin',
      exact: true,
      label: t('adminNavDashboard'),
      icon: LayoutDashboard,
    },
    {
      href: '/admin/logs',
      label: t('adminNavLogs'),
      icon: ScrollText,
    },
    {
      href: '/admin/reports',
      label: t('adminNavReports'),
      icon: AlertCircle,
      badge: pendingReportsCount > 0 ? pendingReportsCount : null,
    },
    {
      href: '/admin/novels',
      label: t('adminNavNovels'),
      icon: BookOpen,
    },
    {
      href: '/admin/users',
      label: t('adminNavUsers'),
      icon: Users,
    },
    {
      href: '/admin/whitelist',
      label: t('adminNavWhitelist'),
      icon: MailCheck,
    },
    {
      href: '/admin/bin',
      label: t('adminNavBin'),
      icon: Trash2,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-6">
          {/* Back to main website link */}
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-amber-400 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 rounded-xl transition-all"
            title={t('adminBackToSite')}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('adminBackToSite')}</span>
          </Link>

          {/* Admin Title & Badge */}
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-100">
                  {t('appTitle')}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                  Console
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Header Utilities */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Realtime Socket Badge */}
          <div
            className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl"
            title={isConnected ? 'Socket.io เชื่อมต่อแบบเรียลไทม์' : 'Socket.io ขาดการเชื่อมต่อ'}
          >
            <Activity className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
            <span className="text-slate-400">{isConnected ? t('online') : t('offline')}</span>
          </div>

          {/* New Novel Import / Scrape Button */}
          <button
            onClick={() => setIsScrapeOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-95 rounded-xl shadow-md shadow-amber-500/20 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">{t('adminNavScrape')}</span>
          </button>

          {/* Combined Theme & Language Settings Dropdown */}
          <SettingsDropdown />

          {/* Admin User Badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
              {user.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-xs font-bold text-slate-200 leading-none">{user.name}</p>
              <p className="text-[10px] text-amber-400/80 leading-none mt-1 font-mono">ADMIN</p>
            </div>
          </div>
        </div>
      </header>

      {/* Admin Navigation Tabs Bar */}
      <nav className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-2.5 overflow-x-auto flex items-center gap-2">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
              {item.badge ? (
                <span
                  className={`px-1.5 py-0.2 text-[10px] font-extrabold rounded-full ${
                    isActive ? 'bg-slate-950 text-amber-300' : 'bg-rose-500 text-white animate-pulse'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Main Admin Content Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">{children}</main>

      {/* Scrape Drawer Modal */}
      <UrlScrapeDrawer isOpen={isScrapeOpen} onClose={() => setIsScrapeOpen(false)} />
    </div>
  );
}
