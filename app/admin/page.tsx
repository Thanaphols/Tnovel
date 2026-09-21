'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  ScrollText,
  BookOpen,
  Users,
  MailCheck,
  AlertCircle,
  Trash2,
  ArrowRight,
  Plus,
  RefreshCw,
  Loader2,
  Clock,
  Shield,
  Activity,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useSocket } from '@/lib/socket';
import UrlScrapeDrawer from '@/components/UrlScrapeDrawer';
import OllamaStatusCard from '@/components/OllamaStatusCard';

export default function AdminDashboardPage() {
  const { t, lang } = useLanguage();
  const { isConnected, socket } = useSocket();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    novelsCount: 0,
    usersCount: 0,
    whitelistCount: 0,
    pendingReportsCount: 0,
    binCount: 0,
    totalLogsCount: 0,
    todayLogsCount: 0,
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [isScrapeOpen, setIsScrapeOpen] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (!socket) return;

    function handleLogCreated(newLog: any) {
      setRecentLogs((prev) => [newLog, ...prev.slice(0, 5)]);
      setStats((prev) => ({
        ...prev,
        totalLogsCount: prev.totalLogsCount + 1,
        todayLogsCount: prev.todayLogsCount + 1,
      }));
    }

    function handleReportCreated() {
      fetchDashboardData();
    }

    socket.on('auditLog:created', handleLogCreated);
    socket.on('report:created', handleReportCreated);

    return () => {
      socket.off('auditLog:created', handleLogCreated);
      socket.off('report:created', handleReportCreated);
    };
  }, [socket]);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const [novelsRes, usersRes, whitelistRes, reportsRes, binRes, logsRes] = await Promise.all([
        fetch('/api/admin/novels').then((r) => r.json()),
        fetch('/api/admin/users').then((r) => r.json()),
        fetch('/api/admin/whitelist').then((r) => r.json()),
        fetch('/api/admin/reports').then((r) => r.json()),
        fetch('/api/bin').then((r) => r.json()),
        fetch('/api/admin/logs?limit=6').then((r) => r.json()),
      ]);

      const pendingReports = (reportsRes.reports || []).filter((r: any) => r.status === 'PENDING');
      const binTotal = (binRes.novels || []).length + (binRes.chapters || []).length;

      setStats({
        novelsCount: (novelsRes.novels || []).length,
        usersCount: (usersRes.users || []).length,
        whitelistCount: (whitelistRes.items || []).length,
        pendingReportsCount: pendingReports.length,
        binCount: binTotal,
        totalLogsCount: logsRes.stats?.totalLogs || 0,
        todayLogsCount: logsRes.stats?.todayLogs || 0,
      });

      setRecentLogs(logsRes.logs || []);
      setRecentReports(pendingReports.slice(0, 4));
    } catch (err) {
      console.error('Fetch dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }

  function getActionBadge(action: string) {
    let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';

    if (action.startsWith('AUTH_LOGIN')) {
      colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    } else if (action === 'AUTH_REGISTER') {
      colorClass = 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    } else if (action === 'USER_ROLE_CHANGE') {
      colorClass = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    } else if (action.includes('DELETE')) {
      colorClass = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    } else if (action.includes('RESTORE') || action === 'NOVEL_CREATE') {
      colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }

    return (
      <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md border ${colorClass}`}>
        {action}
      </span>
    );
  }

  const metricCards = [
    {
      title: t('adminNavLogs'),
      value: stats.totalLogsCount.toLocaleString(),
      subValue: `+${stats.todayLogsCount} วันนี้`,
      href: '/admin/logs',
      icon: ScrollText,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/20',
      desc: 'ตรวจสอบกิจกรรม ใคร ทำอะไร ที่ไหน',
    },
    {
      title: t('adminNavNovels'),
      value: stats.novelsCount.toLocaleString(),
      subValue: 'เรื่องในคลัง',
      href: '/admin/novels',
      icon: BookOpen,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20',
      desc: 'จัดการนิยาย ตอนแปล และสถานะ',
    },
    {
      title: t('adminNavReports'),
      value: stats.pendingReportsCount.toLocaleString(),
      subValue: stats.pendingReportsCount > 0 ? 'รอการแก้ไข' : 'เรียบร้อยดี',
      href: '/admin/reports',
      icon: AlertCircle,
      color: stats.pendingReportsCount > 0 ? 'text-rose-400' : 'text-emerald-400',
      bg: stats.pendingReportsCount > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20',
      desc: 'รายงานปัญหาและข้อผิดพลาดจากผู้อ่าน',
    },
    {
      title: t('adminNavUsers'),
      value: stats.usersCount.toLocaleString(),
      subValue: 'บัญชีในระบบ',
      href: '/admin/users',
      icon: Users,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10 border-purple-500/20',
      desc: 'รายชื่อผู้ใช้และเปลี่ยนสิทธิ์ Admin/User',
    },
    {
      title: t('adminNavWhitelist'),
      value: stats.whitelistCount.toLocaleString(),
      subValue: 'อีเมลที่อนุญาต',
      href: '/admin/whitelist',
      icon: MailCheck,
      color: 'text-teal-400',
      bg: 'bg-teal-500/10 border-teal-500/20',
      desc: 'จัดการสิทธิ์เข้าใช้งานผ่าน Whitelist',
    },
    {
      title: t('adminNavBin'),
      value: stats.binCount.toLocaleString(),
      subValue: 'รายการในถังขยะ',
      href: '/admin/bin',
      icon: Trash2,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10 border-rose-500/20',
      desc: 'กู้คืนหรือลบถาวรนิยายและตอน',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Overview Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('adminNavDashboard')}</h1>
            <p className="text-xs text-slate-400">
              ศูนย์รวมการควบคุมระบบจัดการหลังบ้านทั้งหมด ตรวจสอบสถานะ และกิจกรรมแบบเรียลไทม์
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsScrapeOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-md shadow-amber-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{t('adminNavScrape')}</span>
          </button>

          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="p-2 text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
            title={t('refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* AI Ollama Connection & VRAM Control */}
      <OllamaStatusCard />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              className="p-5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/90 rounded-3xl flex flex-col justify-between group transition-all shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`p-3 rounded-2xl border ${card.bg} ${card.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-slate-100 font-mono tracking-tight">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin text-slate-500 ml-auto" /> : card.value}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">{card.subValue}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 group-hover:text-amber-400 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 line-clamp-1">{card.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Two Columns: Recent Activity Logs & Pending Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Recent Activity Logs Preview */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-slate-100">{t('adminNavLogs')} (ล่าสุด)</h2>
            </div>
            <Link
              href="/admin/logs"
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:underline"
            >
              <span>ดูทั้งหมด</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">{t('loading')}</p>
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              ยังไม่มีบันทึกกิจกรรมล่าสุด
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 font-bold text-xs flex-shrink-0">
                      {log.user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200 truncate">
                          {log.user?.name || log.user?.email || 'ระบบ'}
                        </span>
                        {getActionBadge(log.action)}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{log.details}</p>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Pending Reports & System Health */}
        <div className="lg:col-span-5 space-y-6">
          {/* Pending Reports Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                <h2 className="text-base font-bold text-slate-100">{t('adminNavReports')} (รอตรวจสอบ)</h2>
              </div>
              <Link
                href="/admin/reports"
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 hover:underline"
              >
                <span>ดูทั้งหมด</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {loading ? (
              <div className="py-12 text-center space-y-2">
                <Loader2 className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400">{t('loading')}</p>
              </div>
            ) : recentReports.length === 0 ? (
              <div className="py-8 text-center bg-slate-950/40 border border-slate-800/60 rounded-2xl space-y-1.5">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/60 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">ไม่มีรายงานค้างตรวจ</p>
                <p className="text-[11px] text-slate-500">ระบบทำงานราบรื่นดี</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentReports.map((report) => (
                  <div
                    key={report.id}
                    className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl space-y-1 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-rose-400">{report.reason}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(report.createdAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 line-clamp-1">{report.description || 'ไม่มีรายละเอียด'}</p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {report.novel?.titleTh || report.novel?.titleEn || 'นิยายทั่วไป'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick System Info Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">สถานะการเชื่อมต่อ</h3>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
                <span className="text-slate-300">Socket.IO Real-time Engine</span>
              </div>
              <span className={`text-[11px] font-bold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isConnected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrape Drawer Modal */}
      <UrlScrapeDrawer isOpen={isScrapeOpen} onClose={() => setIsScrapeOpen(false)} />
    </div>
  );
}
