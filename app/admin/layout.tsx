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
  Menu,
  X,
  FlaskConical,
  Library,
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
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer

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

    fetch('/api/admin/reports')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.reports)) {
          setPendingReportsCount(data.reports.filter((r: any) => r.status === 'PENDING').length);
        }
      })
      .catch(() => {});

    function fetchInvites() {
      fetch('/api/admin/invite-requests')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && typeof data.pendingCount === 'number') {
            setPendingInvitesCount(data.pendingCount);
          }
        })
        .catch(() => {});
    }

    fetchInvites();

    const socketInstance = (window as any)._appSocket;
    if (socketInstance) {
      socketInstance.on('admin:invite_request', fetchInvites);
      return () => {
        socketInstance.off('admin:invite_request', fetchInvites);
      };
    }
  }, [router]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

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
    { href: '/admin', exact: true, label: t('adminNavDashboard'), icon: LayoutDashboard },
    { href: '/admin/logs', label: t('adminNavLogs'), icon: ScrollText },
    { href: '/admin/reports', label: t('adminNavReports'), icon: AlertCircle, badge: pendingReportsCount || null },
    { href: '/admin/novels', label: t('adminNavNovels'), icon: BookOpen },
    { href: '/admin/users', label: t('adminNavUsers'), icon: Users },
    { href: '/admin/whitelist', label: t('adminNavWhitelist'), icon: MailCheck, badge: pendingInvitesCount || null },
    { href: '/admin/fandoms', label: t('adminNavFandoms'), icon: Library },
    { href: '/admin/model-test', label: t('adminNavModelTest'), icon: FlaskConical },
    { href: '/admin/bin', label: t('adminNavBin'), icon: Trash2 },
  ];

  const activeItem = navItems.find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));

  const SidebarBody = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800/80">
        <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <p className="font-extrabold text-sm tracking-tight text-slate-100 leading-none">{t('appTitle')}</p>
          <p className="text-[10px] uppercase tracking-widest font-bold text-amber-400/80 mt-1">Console</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                isActive
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-extrabold rounded-full ${
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

      {/* Footer: connection + user + back to site */}
      <div className="px-3 py-3 border-t border-slate-800/80 space-y-2">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold bg-slate-950/60 border border-slate-800 rounded-xl">
          <Activity className={`w-3.5 h-3.5 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
          <span className="text-slate-400">{isConnected ? t('online') : t('offline')}</span>
        </div>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-sm flex-shrink-0">
            {user.name?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-200 leading-none truncate">{user.name}</p>
            <p className="text-[10px] text-amber-400/80 leading-none mt-1 font-mono">ADMIN</p>
          </div>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 rounded-xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('adminBackToSite')}</span>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 flex-shrink-0 bg-slate-900/70 border-r border-slate-800 sticky top-0 h-screen">
        {SidebarBody}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-slate-900 border-r border-slate-800 h-full animate-in slide-in-from-left">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-3 p-1.5 text-slate-400 hover:text-slate-100"
              aria-label="ปิดเมนู"
            >
              <X className="w-5 h-5" />
            </button>
            {SidebarBody}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-400 hover:text-slate-100 bg-slate-950/60 border border-slate-800 rounded-xl"
              aria-label="เปิดเมนู"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 min-w-0">
              {activeItem?.icon ? <activeItem.icon className="w-5 h-5 text-amber-400 flex-shrink-0" /> : null}
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-100 truncate">
                {activeItem?.label || t('adminNavDashboard')}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsScrapeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-95 rounded-xl shadow-md shadow-amber-500/20 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">{t('adminNavScrape')}</span>
            </button>
            <SettingsDropdown />
          </div>
        </header>

        {/* Content canvas */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">{children}</main>
      </div>

      <UrlScrapeDrawer isOpen={isScrapeOpen} onClose={() => setIsScrapeOpen(false)} />
    </div>
  );
}
