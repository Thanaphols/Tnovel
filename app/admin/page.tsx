'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Users,
  BookOpen,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Activity,
  Trash2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  MailCheck,
  Plus,
  Mail,
  UserCheck,
} from 'lucide-react';
import { useSocket } from '@/lib/socket';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { useLanguage } from '@/lib/languageContext';

export default function AdminDashboardPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'users' | 'novels' | 'reports' | 'whitelist'>('reports');
  const [users, setUsers] = useState<any[]>([]);
  const [novels, setNovels] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchNovel, setSearchNovel] = useState('');
  const [searchWhitelist, setSearchWhitelist] = useState('');
  const [reportFilter, setReportFilter] = useState<'ALL' | 'PENDING' | 'RESOLVED' | 'DISMISSED'>('ALL');

  // Whitelist form states
  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [addingWhitelist, setAddingWhitelist] = useState(false);
  const [whitelistMsg, setWhitelistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingWhitelistId, setDeletingWhitelistId] = useState<string | null>(null);

  // Actions loading states
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [updatingReport, setUpdatingReport] = useState<string | null>(null);
  const [deleteModalItem, setDeleteModalItem] = useState<{ id: string; title: string; action: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { isConnected, socket } = useSocket();
  const router = useRouter();

  useEffect(() => {
    fetchInitialData();
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

  async function fetchInitialData() {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchNovels(), fetchReports(), fetchWhitelist()]);
    setLoading(false);
  }

  async function fetchWhitelist() {
    try {
      const res = await fetch('/api/admin/whitelist');
      const data = await res.json();
      if (data.success) {
        setWhitelist(data.items || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      } else {
        router.push('/');
      }
    } catch {
      router.push('/');
    }
  }

  async function fetchNovels() {
    try {
      const res = await fetch('/api/admin/novels');
      const data = await res.json();
      if (data.success) {
        setNovels(data.novels || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchReports() {
    try {
      const res = await fetch('/api/admin/reports');
      const data = await res.json();
      if (data.success) {
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Whitelist Actions
  async function handleAddWhitelist(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;

    setAddingWhitelist(true);
    setWhitelistMsg(null);

    try {
      const res = await fetch('/api/admin/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, note: newNote }),
      });
      const data = await res.json();
      if (data.success) {
        setWhitelistMsg({ type: 'success', text: data.message || t('whitelistAddSuccess') });
        setNewEmail('');
        setNewNote('');
        await fetchWhitelist();
      } else {
        setWhitelistMsg({ type: 'error', text: data.error || t('whitelistAddError') });
      }
    } catch (err: any) {
      setWhitelistMsg({ type: 'error', text: err.message || t('networkError') });
    } finally {
      setAddingWhitelist(false);
    }
  }

  async function handleDeleteWhitelist(id: string, email: string) {
    if (email === 'cupteo254504@gmail.com') {
      alert(t('cannotDeletePrimaryAdmin'));
      return;
    }
    if (!confirm(`${t('confirmDeleteWhitelistMsg')} (${email})`)) {
      return;
    }

    setDeletingWhitelistId(id);
    try {
      const res = await fetch(`/api/admin/whitelist?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setWhitelist((prev) => prev.filter((item) => item.id !== id));
      } else {
        alert(data.error || t('deleteWhitelistError'));
      }
    } catch (err: any) {
      alert(err.message || t('deleteWhitelistError'));
    } finally {
      setDeletingWhitelistId(null);
    }
  }

  // User Actions
  async function handleToggleRole(userId: string, currentRole: string) {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    setUpdatingUser(userId);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newRole }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingUser(null);
    }
  }

  // Report Actions
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
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status } : r))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingReport(null);
    }
  }

  async function handleDeleteReport(reportId: string) {
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

  // Novel Actions
  async function handleNovelAction(action: 'delete_soft' | 'restore' | 'delete_permanent', novelId: string) {
    setIsDeleting(true);
    try {
      const res = await fetch('/api/admin/novels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, novelId }),
      });
      const data = await res.json();
      if (data.success) {
        if (action === 'delete_permanent') {
          setNovels((prev) => prev.filter((n) => n.id !== novelId));
        } else if (action === 'delete_soft') {
          setNovels((prev) =>
            prev.map((n) => (n.id === novelId ? { ...n, deletedAt: new Date().toISOString() } : n))
          );
        } else if (action === 'restore') {
          setNovels((prev) =>
            prev.map((n) => (n.id === novelId ? { ...n, deletedAt: null } : n))
          );
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
      setDeleteModalItem(null);
    }
  }

  const pendingReportsCount = reports.filter((r) => r.status === 'PENDING').length;

  const filteredNovels = novels.filter((n) =>
    (n.titleTh + n.titleEn + (n.author?.name || '')).toLowerCase().includes(searchNovel.toLowerCase())
  );

  const filteredReports = reports.filter((r) => {
    if (reportFilter === 'ALL') return true;
    return r.status === reportFilter;
  });

  const filteredWhitelist = whitelist.filter((item) =>
    (item.email + (item.note || '')).toLowerCase().includes(searchWhitelist.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Top Back Link */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors">
        <ArrowLeft className="w-4 h-4" /> {t('backToLibrary')}
      </Link>

      {/* Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('adminPageTitle')}</h1>
            <p className="text-xs text-slate-400">{t('adminPageDesc')}</p>
          </div>
        </div>

        {/* Socket Status Badge */}
        <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl self-start sm:self-auto">
          <Activity className={`w-4 h-4 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
          <span>Socket.io: {isConnected ? t('socketConnected') : t('socketDisconnected')}</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-2xl transition-all ${
            activeTab === 'reports'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/60'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          <span>{t('adminTabReports')}</span>
          {pendingReportsCount > 0 && (
            <span
              className={`px-1.5 py-0.5 text-[10px] font-extrabold rounded-full ${
                activeTab === 'reports' ? 'bg-slate-950 text-amber-300' : 'bg-rose-500 text-white animate-pulse'
              }`}
            >
              {pendingReportsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('novels')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-2xl transition-all ${
            activeTab === 'novels'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/60'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>{t('adminTabNovels')} ({novels.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-2xl transition-all ${
            activeTab === 'users'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{t('adminTabUsers')} ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('whitelist')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-2xl transition-all ${
            activeTab === 'whitelist'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-slate-200 bg-slate-900/60'
          }`}
        >
          <MailCheck className="w-4 h-4" />
          <span>{t('adminTabWhitelist')} ({whitelist.length})</span>
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">{t('adminLoading')}</p>
        </div>
      ) : (
        <>
          {/* TAB 1: REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              {/* Filter Sub-bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-300">{t('statusLabel')}</span>
                  {(['ALL', 'PENDING', 'RESOLVED', 'DISMISSED'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setReportFilter(st)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                        reportFilter === st
                          ? 'bg-slate-800 text-amber-400 border border-amber-500/30'
                          : 'text-slate-400 hover:text-slate-200'
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
                  className="flex items-center gap-1 px-3 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded-lg transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t('refresh')}</span>
                </button>
              </div>

              {filteredReports.length === 0 ? (
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
                      className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-3 hover:border-slate-700 transition-all"
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

                        <span className="text-[11px] text-slate-400">
                          {new Date(report.createdAt).toLocaleString('th-TH')}
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
          )}

          {/* TAB 2: NOVELS */}
          {activeTab === 'novels' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-3">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchNovel}
                  onChange={(e) => setSearchNovel(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="w-full bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                />
              </div>

              {/* Novels Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                      <tr>
                        <th className="p-4">{t('thNovel')}</th>
                        <th className="p-4">{t('thAuthor')}</th>
                        <th className="p-4">{t('thChaptersCount')}</th>
                        <th className="p-4">{t('thReports')}</th>
                        <th className="p-4">{t('thStatus')}</th>
                        <th className="p-4 text-right">{t('thAction')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {filteredNovels.map((novel) => (
                        <tr key={novel.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-4">
                            <div className="font-bold text-slate-100">{novel.titleTh || novel.titleEn}</div>
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">{novel.titleEn}</div>
                            <a
                              href={novel.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-amber-400/80 hover:underline pt-0.5"
                            >
                              <span>{t('originalWebsite')}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </td>
                          <td className="p-4 text-slate-300">{novel.author?.name || t('unknownAuthor')}</td>
                          <td className="p-4 font-semibold text-amber-300">{novel._count?.chapters || 0} {t('chaptersCount')}</td>
                          <td className="p-4">
                            {novel._count?.reports > 0 ? (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md">
                                {novel._count.reports} {t('reportsUnit')}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500">-</span>
                            )}
                          </td>
                          <td className="p-4">
                            {novel.deletedAt ? (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-md">
                                {t('statusInBin')}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md">
                                {t('statusActive')}
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {novel.deletedAt ? (
                                <button
                                  onClick={() => handleNovelAction('restore', novel.id)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all"
                                  title={t('restore')}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>{t('restore')}</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleNovelAction('delete_soft', novel.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                                  title={t('moveToBinTooltip')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() =>
                                  setDeleteModalItem({
                                    id: novel.id,
                                    title: novel.titleTh || novel.titleEn,
                                    action: 'delete_permanent',
                                  })
                                }
                                className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-all"
                                title={t('permanentDelete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: USERS */}
          {activeTab === 'users' && (
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" /> {t('usersListTitle')} ({users.length})
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                    <tr>
                      <th className="p-3">{t('userColNameEmail')}</th>
                      <th className="p-3">{t('userColRole')}</th>
                      <th className="p-3">{t('userColNovelsTranslated')}</th>
                      <th className="p-3">{t('userColRegisteredDate')}</th>
                      <th className="p-3 text-right">{t('userColManageRole')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-semibold text-slate-100">
                          <div>{u.name || t('userNoName')}</div>
                          <div className="text-[11px] text-slate-400 font-normal">{u.email}</div>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === 'ADMIN'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3">{u._count?.submittedNovels || 0} {t('storiesUnit')}</td>
                        <td className="p-3">{new Date(u.createdAt).toLocaleDateString('th-TH')}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleToggleRole(u.id, u.role)}
                            disabled={updatingUser === u.id}
                            className="px-3 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg transition-all disabled:opacity-50"
                          >
                            {updatingUser === u.id
                              ? t('updating')
                              : u.role === 'ADMIN'
                              ? t('demoteToUser')
                              : t('promoteToAdmin')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: WHITELIST */}
          {activeTab === 'whitelist' && (
            <div className="space-y-6">
              {/* Form to Add Whitelist Email */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <MailCheck className="w-5 h-5 text-amber-400" /> {t('addWhitelistTitle')}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t('addWhitelistDesc')}
                    </p>
                  </div>
                </div>

                {whitelistMsg && (
                  <div
                    className={`p-3 text-xs rounded-xl flex items-center justify-between gap-2 ${
                      whitelistMsg.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                    }`}
                  >
                    <span>{whitelistMsg.text}</span>
                    <button
                      onClick={() => setWhitelistMsg(null)}
                      className="text-slate-400 hover:text-slate-200 text-sm font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <form onSubmit={handleAddWhitelist} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">{t('emailLabel')}</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder={t('emailWhitelistPlaceholder')}
                        required
                        className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-4 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">{t('emailNoteLabel')}</label>
                    <input
                      type="text"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder={t('emailNotePlaceholder')}
                      className="w-full px-4 py-2 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={addingWhitelist || !newEmail}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-4 text-xs sm:text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
                    >
                      {addingWhitelist ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>{t('addEmailBtn')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Whitelist Table */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-amber-400" />
                    {t('whitelistListTitle')} ({whitelist.length})
                  </h3>

                  {/* Search Bar */}
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchWhitelist}
                      onChange={(e) => setSearchWhitelist(e.target.value)}
                      placeholder={t('searchWhitelistPlaceholder')}
                      className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                </div>

                {filteredWhitelist.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    {searchWhitelist ? t('whitelistNotFound') : t('whitelistEmpty')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                        <tr>
                          <th className="p-3">{t('whitelistColEmail')}</th>
                          <th className="p-3">{t('whitelistColNote')}</th>
                          <th className="p-3">{t('whitelistColAccountStatus')}</th>
                          <th className="p-3">{t('whitelistColDate')}</th>
                          <th className="p-3 text-right">{t('whitelistColAction')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {filteredWhitelist.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-800/30">
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-100">{item.email}</span>
                                {item.isPrimaryAdmin && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Primary Admin
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-slate-400">
                              {item.note || <span className="italic text-slate-600">{t('noNote')}</span>}
                            </td>
                            <td className="p-3">
                              {item.user ? (
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                                  <span className="text-slate-200 font-medium">
                                    {item.user.name || t('hasAccount')} ({item.user.role})
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-slate-500">
                                  <span className="inline-block w-2 h-2 rounded-full bg-slate-600" />
                                  <span>{t('notLoggedInYet')}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-slate-400">
                              {new Date(item.createdAt).toLocaleDateString('th-TH', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="p-3 text-right">
                              {item.isPrimaryAdmin ? (
                                <span className="text-[11px] text-slate-600 italic">{t('primaryAdmin')}</span>
                              ) : (
                                <button
                                  onClick={() => handleDeleteWhitelist(item.id, item.email)}
                                  disabled={deletingWhitelistId === item.id}
                                  className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 rounded-lg transition-all disabled:opacity-50"
                                  title={t('removeFromWhitelistTooltip')}
                                >
                                  {deletingWhitelistId === item.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Permanent Delete Modal for Admin */}
      {deleteModalItem && (
        <ConfirmDeleteModal
          isOpen={true}
          title={`${t('confirmPermanentDeleteSingleTitle')}: "${deleteModalItem.title}"`}
          message={t('confirmPermanentDeleteSingleMsg')}
          confirmLabel={t('confirmDeleteButton')}
          isLoading={isDeleting}
          onConfirm={() => handleNovelAction('delete_permanent', deleteModalItem.id)}
          onClose={() => setDeleteModalItem(null)}
        />
      )}
    </div>
  );
}
