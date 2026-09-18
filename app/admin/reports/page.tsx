'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Filter,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useSocket } from '@/lib/socket';

export default function AdminReportsPage() {
  const { t, lang } = useLanguage();
  const { socket } = useSocket();

  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportFilter, setReportFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED' | 'DISMISSED'>('ALL');
  const [updatingReport, setUpdatingReport] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (!socket) return;
    function handleReportCreated() {
      fetchReports();
    }
    socket.on('report:created', handleReportCreated);
    return () => {
      socket.off('report:created', handleReportCreated);
    };
  }, [socket]);

  async function fetchReports() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/reports');
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateReportStatus(reportId: string, status: 'RESOLVED' | 'DISMISSED' | 'PENDING') {
    setUpdatingReport(reportId);
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, status }),
      });
      const data = await res.json();
      if (data.success) {
        setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingReport(null);
    }
  }

  async function handleDeleteReport(reportId: string) {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบรายงานนี้?')) return;
    setUpdatingReport(reportId);
    try {
      const res = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action: 'delete' }),
      });
      const data = await res.json();
      if (data.success) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingReport(null);
    }
  }

  const pendingReportsCount = reports.filter((r) => r.status === 'PENDING').length;
  const filteredReports = reports.filter((r) => {
    if (reportFilter === 'ALL') return true;
    return r.status === reportFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('adminTabReports')}</h1>
            <p className="text-xs text-slate-400">ตรวจสอบและจัดการรายงานข้อผิดพลาดจากผู้อ่าน</p>
          </div>
        </div>

        {pendingReportsCount > 0 && (
          <div className="px-3.5 py-1.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-bold flex items-center gap-2 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>รอการตรวจสอบ {pendingReportsCount} รายการ</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 mr-1" />
          {(['ALL', 'PENDING', 'RESOLVED', 'DISMISSED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setReportFilter(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                reportFilter === st
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-950/60 border border-slate-800'
              }`}
            >
              {st === 'ALL'
                ? t('filterAll')
                : st === 'PENDING'
                ? `${t('filterPending')} (${pendingReportsCount})`
                : st === 'RESOLVED'
                ? t('filterResolved')
                : t('filterDismissed')}
            </button>
          ))}
        </div>

        <button
          onClick={fetchReports}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          <span>{t('refresh')}</span>
        </button>
      </div>

      {/* Reports List */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">{t('loading')}</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 border border-slate-800/60 rounded-3xl space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto" />
          <h4 className="text-sm font-semibold text-slate-300">{t('noReportsTitle')}</h4>
          <p className="text-xs text-slate-500">{t('noReportsDesc')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-3 hover:border-slate-700 transition-all shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md border ${
                      report.status === 'PENDING'
                        ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        : report.status === 'RESOLVED'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {report.status === 'PENDING'
                      ? t('filterPending')
                      : report.status === 'RESOLVED'
                      ? t('filterResolved')
                      : t('filterDismissed')}
                  </span>
                  <h4 className="text-xs font-bold text-slate-100">{report.reason}</h4>
                </div>

                <span className="text-[11px] text-slate-400 font-mono">
                  {new Date(report.createdAt).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}
                </span>
              </div>

              {/* Details & Target novel/chapter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-1">
                  <span className="text-[11px] font-semibold text-amber-400">{t('reportLocationLabel')}</span>
                  <div className="text-slate-200 font-bold">
                    {report.novel?.titleTh || report.novel?.titleEn || t('generalNovel')}
                  </div>
                  {report.chapter && (
                    <div className="text-[11px] text-slate-400">
                      {t('chapterPrefix')} {report.chapter.chapterNumber}: {report.chapter.titleTh || report.chapter.titleEn}
                    </div>
                  )}
                  {report.chapter?.id && (
                    <Link
                      href={`/reader/${report.chapter.id}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline pt-1"
                    >
                      <span>{t('viewThisChapter')}</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/60 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">{t('reportUserDetailLabel')}</span>
                  <p className="text-slate-300 italic">
                    {report.description ? `"${report.description}"` : t('noDescriptionProvided')}
                  </p>
                  <div className="text-[11px] text-slate-500 pt-1">
                    {t('reportedBy')}{report.user ? `${report.user.name || 'User'} (${report.user.email})` : t('guest')}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                {report.status !== 'RESOLVED' && (
                  <button
                    onClick={() => handleUpdateReportStatus(report.id, 'RESOLVED')}
                    disabled={updatingReport === report.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t('markAsResolved')}</span>
                  </button>
                )}

                {report.status !== 'DISMISSED' && (
                  <button
                    onClick={() => handleUpdateReportStatus(report.id, 'DISMISSED')}
                    disabled={updatingReport === report.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{t('dismissReport')}</span>
                  </button>
                )}

                <button
                  onClick={() => handleDeleteReport(report.id)}
                  disabled={updatingReport === report.id}
                  className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-all disabled:opacity-50"
                  title={t('deleteReportTooltip')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
