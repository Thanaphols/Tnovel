'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollText,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  Calendar,
  User as UserIcon,
  Shield,
  Clock,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Laptop,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useSocket } from '@/lib/socket';

interface AuditLogItem {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
    role: string;
  } | null;
}

export default function AdminLogsPage() {
  const { t, lang } = useLanguage();
  const { socket } = useSocket();

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });
  const [stats, setStats] = useState({
    totalLogs: 0,
    todayLogs: 0,
  });

  const fetchLogs = useCallback(
    async (currentPage = page, currentCategory = category, currentSearch = search) => {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          page: String(currentPage),
          category: currentCategory,
          search: currentSearch,
          limit: '50',
        });

        const res = await fetch(`/api/admin/logs?${query.toString()}`);
        const data = await res.json();
        if (data.success) {
          setLogs(data.logs || []);
          if (data.pagination) setPagination(data.pagination);
          if (data.stats) setStats(data.stats);
        }
      } catch (err) {
        console.error('Fetch audit logs error:', err);
      } finally {
        setLoading(false);
      }
    },
    [page, category, search]
  );

  useEffect(() => {
    fetchLogs(page, category, search);
  }, [page, category, fetchLogs, search]);

  // Real-time socket listener for incoming audit logs
  useEffect(() => {
    if (!socket) return;

    function handleNewLog(newLog: AuditLogItem) {
      if (category === 'ALL' || newLog.action.startsWith(category)) {
        setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
      }
      setStats((prev) => ({
        totalLogs: prev.totalLogs + 1,
        todayLogs: prev.todayLogs + 1,
      }));
    }

    socket.on('auditLog:created', handleNewLog);
    return () => {
      socket.off('auditLog:created', handleNewLog);
    };
  }, [socket, category]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchLogs(1, category, search);
  }

  function handleCategoryChange(newCategory: string) {
    setCategory(newCategory);
    setPage(1);
  }

  function getActionBadge(action: string) {
    let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';

    if (action.startsWith('AUTH_LOGIN')) {
      colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    } else if (action === 'AUTH_REGISTER') {
      colorClass = 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    } else if (action === 'AUTH_LOGOUT') {
      colorClass = 'bg-slate-700/40 text-slate-400 border-slate-700';
    } else if (action === 'USER_ROLE_CHANGE') {
      colorClass = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    } else if (action === 'WHITELIST_ADD') {
      colorClass = 'bg-teal-500/15 text-teal-400 border-teal-500/30';
    } else if (action === 'WHITELIST_DELETE') {
      colorClass = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    } else if (action === 'NOVEL_CREATE' || action === 'CHAPTER_PASTE') {
      colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    } else if (action.includes('DELETE_SOFT')) {
      colorClass = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    } else if (action.includes('RESTORE')) {
      colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    } else if (action.includes('DELETE_PERMANENT') || action === 'REPORT_DELETE') {
      colorClass = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    } else if (action === 'CHAPTER_RETRANSLATE') {
      colorClass = 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    } else if (action === 'REPORT_CREATE') {
      colorClass = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    } else if (action === 'REPORT_RESOLVE') {
      colorClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    } else if (action === 'REPORT_DISMISS') {
      colorClass = 'bg-slate-700/50 text-slate-400 border-slate-700';
    }

    return (
      <span className={`inline-block px-2.5 py-0.5 text-[11px] font-mono font-bold rounded-lg border ${colorClass}`}>
        {action}
      </span>
    );
  }

  const categoryFilters = [
    { key: 'ALL', label: t('logsFilterAll') },
    { key: 'AUTH', label: t('logsFilterAuth') },
    { key: 'NOVEL', label: t('logsFilterNovels') },
    { key: 'CHAPTER', label: t('logsFilterChapters') },
    { key: 'WHITELIST', label: t('logsFilterWhitelist') },
    { key: 'REPORT', label: t('logsFilterReports') },
    { key: 'BIN', label: t('logsFilterBin') },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
            <ScrollText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('logsPageTitle')}</h1>
            <p className="text-xs text-slate-400">{t('logsPageDesc')}</p>
          </div>
        </div>

        {/* Counter Badges */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
            <span className="text-slate-400">{t('logsTotalRecords')}: </span>
            <span className="text-amber-400 font-bold">{stats.totalLogs.toLocaleString()}</span>
          </div>
          <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
            <span className="text-slate-400">{t('logsTodayRecords')}: </span>
            <span className="text-emerald-400 font-bold">{stats.todayLogs.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Control Bar (Search, Category Filters, Refresh) */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('logsSearchPlaceholder')}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </form>

          {/* Refresh Button */}
          <button
            onClick={() => fetchLogs(page, category, search)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all self-end md:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>{t('refresh')}</span>
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5">
          <Filter className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mr-1" />
          {categoryFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => handleCategoryChange(f.key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                category === f.key
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table / List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        {loading && logs.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">{t('loading')}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <ScrollText className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-300">{t('logsEmpty')}</p>
            <p className="text-xs text-slate-500">{t('logsSearchPlaceholder')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
                  <th className="p-3.5 pl-5">{t('logsColTime')}</th>
                  <th className="p-3.5">{t('logsColUser')}</th>
                  <th className="p-3.5">{t('logsColAction')}</th>
                  <th className="p-3.5">{t('logsColDetails')}</th>
                  <th className="p-3.5 pr-5">{t('logsColIp')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    {/* Timestamp */}
                    <td className="p-3.5 pl-5 text-slate-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="font-mono text-[11px]">
                          {new Date(log.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    </td>

                    {/* Actor (User) */}
                    <td className="p-3.5 whitespace-nowrap">
                      {log.user ? (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400 text-xs flex-shrink-0 overflow-hidden">
                            {log.user.avatar ? (
                              <img src={log.user.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              log.user.name?.[0]?.toUpperCase() || 'U'
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-200">
                                {log.user.name || log.user.email.split('@')[0]}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  log.user.role === 'ADMIN'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {log.user.role}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 block font-mono">{log.user.email}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-500">
                          <div className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 text-xs">
                            <UserIcon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-[11px] italic">{t('systemActor')}</span>
                        </div>
                      )}
                    </td>

                    {/* Action Badge */}
                    <td className="p-3.5 whitespace-nowrap">{getActionBadge(log.action)}</td>

                    {/* Details */}
                    <td className="p-3.5 text-slate-200 max-w-md">
                      <p className="line-clamp-2 leading-relaxed font-normal">{log.details || '-'}</p>
                    </td>

                    {/* IP & User Agent */}
                    <td className="p-3.5 pr-5 whitespace-nowrap text-slate-400">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Globe className="w-3 h-3 text-slate-500" />
                        <span>{log.ipAddress || '-'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              {t('logsPage')} <span className="text-amber-400 font-bold">{pagination.page}</span> {t('logsOf')}{' '}
              <span className="font-bold">{pagination.totalPages}</span> ({pagination.total.toLocaleString()}{' '}
              {t('logsTotalRecords')})
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{t('logsPrev')}</span>
              </button>

              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={pagination.page >= pagination.totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{t('logsNext')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
