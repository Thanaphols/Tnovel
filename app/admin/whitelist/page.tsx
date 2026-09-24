'use client';

import React, { useState, useEffect } from 'react';
import {
  MailCheck,
  Mail,
  Plus,
  UserCheck,
  Search,
  Trash2,
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  Check,
  X,
  Filter,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useAuth } from '@/lib/authContext';

export default function AdminWhitelistPage() {
  const { t, lang } = useLanguage();
  const { user: currentUser } = useAuth();

  // Tab State: 'whitelist' or 'requests'
  const [activeTab, setActiveTab] = useState<'whitelist' | 'requests'>('whitelist');

  // Whitelist States
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchWhitelist, setSearchWhitelist] = useState('');

  // Form states
  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newRole, setNewRole] = useState<'USER' | 'ADMIN'>('USER');
  const [addingWhitelist, setAddingWhitelist] = useState(false);
  const [whitelistMsg, setWhitelistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingWhitelistId, setDeletingWhitelistId] = useState<string | null>(null);
  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  // Pending role change awaiting confirmation in the modal.
  const [pendingRole, setPendingRole] = useState<
    { email: string; note?: string; current: string; target: 'USER' | 'ADMIN' } | null
  >(null);

  // Invite Requests States
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsFilter, setRequestsFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [searchRequests, setSearchRequests] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  useEffect(() => {
    fetchWhitelist();
    fetchRequests();

    const socketInstance = (window as any)._appSocket;
    if (socketInstance) {
      const handleInviteUpdate = () => {
        fetchRequests();
        fetchWhitelist();
      };
      socketInstance.on('admin:invite_request', handleInviteUpdate);
      return () => {
        socketInstance.off('admin:invite_request', handleInviteUpdate);
      };
    }
  }, []);

  async function fetchWhitelist() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/whitelist');
      const data = await res.json();
      if (data.success) {
        setWhitelist(data.items || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRequests() {
    setLoadingRequests(true);
    try {
      const res = await fetch('/api/admin/invite-requests');
      const data = await res.json();
      if (data.success) {
        setRequests(data.items || []);
        if (typeof data.pendingCount === 'number') {
          setPendingRequestsCount(data.pendingCount);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRequests(false);
    }
  }

  async function handleAddWhitelist(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail) return;

    setAddingWhitelist(true);
    setWhitelistMsg(null);

    try {
      const res = await fetch('/api/admin/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, note: newNote, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        setWhitelistMsg({ type: 'success', text: data.message || t('whitelistAddSuccess') });
        setNewEmail('');
        setNewNote('');
        setNewRole('USER');
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

  // Open the confirm modal for a role change picked from the dropdown.
  function requestRoleChange(email: string, currentRole: string, target: 'USER' | 'ADMIN', note?: string) {
    if (target === currentRole) return;
    if (email.toLowerCase() === 'cupteo254504@gmail.com') {
      alert('ไม่สามารถลดสิทธิ์ของ Primary Admin ได้');
      return;
    }
    if (currentUser?.email && email.toLowerCase() === currentUser.email.toLowerCase() && currentRole === 'ADMIN') {
      alert('คุณไม่สามารถลดสิทธิ์บัญชีของตนเองได้');
      return;
    }
    setPendingRole({ email, note, current: currentRole, target });
  }

  async function confirmRoleChange() {
    if (!pendingRole) return;
    const { email, target, note } = pendingRole;
    setTogglingEmail(email);
    try {
      const res = await fetch('/api/admin/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: target, note }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchWhitelist();
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์');
      }
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setTogglingEmail(null);
      setPendingRole(null);
    }
  }

  async function handleDeleteWhitelist(id: string, email: string) {
    if (email.toLowerCase() === 'cupteo254504@gmail.com') {
      alert(t('cannotDeletePrimaryAdmin'));
      return;
    }
    if (currentUser?.email && email.toLowerCase() === currentUser.email.toLowerCase()) {
      alert('คุณไม่สามารถลบอีเมลของตนเองออกจาก Whitelist ได้');
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

  async function handleApproveRequest(id: string, role: 'USER' | 'ADMIN' = 'USER') {
    setProcessingRequestId(id);
    try {
      const res = await fetch('/api/admin/invite-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', id, role }),
      });
      const data = await res.json();
      if (data.success) {
        setWhitelistMsg({ type: 'success', text: data.message });
        await Promise.all([fetchRequests(), fetchWhitelist()]);
      } else {
        setWhitelistMsg({ type: 'error', text: data.error || 'อนุมัติไม่สำเร็จ' });
      }
    } catch (err: any) {
      setWhitelistMsg({ type: 'error', text: err.message || t('networkError') });
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function handleRejectRequest(id: string) {
    if (!confirm('ต้องการปฏิเสธคำขอนี้ใช่หรือไม่?')) return;
    setProcessingRequestId(id);
    try {
      const res = await fetch('/api/admin/invite-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', id }),
      });
      const data = await res.json();
      if (data.success) {
        setWhitelistMsg({ type: 'success', text: data.message });
        await fetchRequests();
      } else {
        setWhitelistMsg({ type: 'error', text: data.error || 'ปฏิเสธไม่สำเร็จ' });
      }
    } catch (err: any) {
      setWhitelistMsg({ type: 'error', text: err.message || t('networkError') });
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function handleDeleteRequest(id: string, email: string) {
    if (!confirm(`ต้องการลบประวัติคำขอของ ${email} ใช่หรือไม่?`)) return;
    setProcessingRequestId(id);
    try {
      const res = await fetch(`/api/admin/invite-requests?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setWhitelistMsg({ type: 'success', text: data.message });
        setRequests((prev) => prev.filter((r) => r.id !== id));
      } else {
        setWhitelistMsg({ type: 'error', text: data.error || 'ลบไม่สำเร็จ' });
      }
    } catch (err: any) {
      setWhitelistMsg({ type: 'error', text: err.message || t('networkError') });
    } finally {
      setProcessingRequestId(null);
    }
  }

  const filteredWhitelist = whitelist.filter((item) =>
    (item.email + (item.note || '')).toLowerCase().includes(searchWhitelist.toLowerCase())
  );

  const filteredRequests = requests.filter((req) => {
    if (requestsFilter !== 'ALL' && req.status !== requestsFilter) return false;
    if (searchRequests) {
      const q = searchRequests.toLowerCase();
      return (
        req.email?.toLowerCase().includes(q) ||
        req.name?.toLowerCase().includes(q) ||
        req.note?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
            <MailCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('adminTabWhitelist')}</h1>
            <p className="text-xs text-slate-400">กำหนดรายชื่ออีเมลที่ได้รับอนุญาตให้เข้าสู่ระบบ (Whitelist) และจัดการคำขอ Invite</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
            <span className="text-slate-400">ในระบบ: </span>
            <span className="text-amber-400 font-bold">{whitelist.length} รายการ</span>
          </div>
          <button
            onClick={() => {
              fetchWhitelist();
              fetchRequests();
            }}
            disabled={loading || loadingRequests}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingRequests ? 'animate-spin text-amber-400' : ''}`} />
            <span>{t('refresh')}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('whitelist')}
          className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
            activeTab === 'whitelist'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <MailCheck className="w-4 h-4" />
          <span>{t('inviteRequestTabWhitelist')}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-mono ${
              activeTab === 'whitelist' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {whitelist.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all relative ${
            activeTab === 'requests'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{t('inviteRequestTabPending')}</span>
          {pendingRequestsCount > 0 ? (
            <span className="px-2 py-0.5 bg-rose-500 text-white rounded-full text-xs font-mono font-bold animate-pulse">
              {pendingRequestsCount}
            </span>
          ) : (
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-mono ${
                activeTab === 'requests' ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {requests.length}
            </span>
          )}
        </button>
      </div>

      {whitelistMsg && (
        <div
          className={`p-3 text-xs rounded-xl flex items-center justify-between gap-2 animate-fade-in ${
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

      {/* TAB 1: Whitelist Members */}
      {activeTab === 'whitelist' && (
        <>
          {/* Form to Add Whitelist Email */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" /> {t('addWhitelistTitle')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{t('addWhitelistDesc')}</p>
            </div>

            <form onSubmit={handleAddWhitelist} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5 space-y-1.5">
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

              <div className="sm:col-span-3 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">สิทธิ์ที่จะได้รับ (Role)</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'USER' | 'ADMIN')}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60 font-medium"
                >
                  <option value="USER">👤 ผู้ใช้ทั่วไป (USER)</option>
                  <option value="ADMIN">🛡️ ผู้ดูแลระบบ (ADMIN)</option>
                </select>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
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
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
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

            {loading ? (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400">{t('loading')}</p>
              </div>
            ) : filteredWhitelist.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                {searchWhitelist ? t('whitelistNotFound') : t('whitelistEmpty')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                    <tr>
                      <th className="p-3 pl-4">{t('whitelistColEmail')}</th>
                      <th className="p-3">{t('whitelistColNote')}</th>
                      <th className="p-3">{t('whitelistColRole')}</th>
                      <th className="p-3">{t('whitelistColAccountStatus')}</th>
                      <th className="p-3">{t('whitelistColDate')}</th>
                      <th className="p-3 pr-4 text-right">{t('whitelistColAction')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredWhitelist.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100 font-mono">{item.email}</span>
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
                          {item.isPrimaryAdmin ||
                          (currentUser?.email &&
                            item.email.toLowerCase() === currentUser.email.toLowerCase() &&
                            (item.role || 'USER') === 'ADMIN') ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${
                                (item.role || 'USER') === 'ADMIN'
                                  ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40'
                                  : 'bg-slate-800 text-slate-500 border-slate-700'
                              }`}
                            >
                              {(item.role || 'USER') === 'ADMIN' ? '🛡️ ADMIN' : '👤 USER'}
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <select
                                value={item.role || 'USER'}
                                disabled={togglingEmail === item.email}
                                onChange={(e) =>
                                  requestRoleChange(item.email, item.role || 'USER', e.target.value as 'USER' | 'ADMIN', item.note)
                                }
                                className="px-2.5 py-1 text-xs font-bold bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500/60 disabled:opacity-50 cursor-pointer"
                              >
                                <option value="USER">👤 USER</option>
                                <option value="ADMIN">🛡️ ADMIN</option>
                              </select>
                              {togglingEmail === item.email && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                              )}
                            </div>
                          )}
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
                        <td className="p-3 text-slate-400 font-mono">
                          {new Date(item.createdAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="p-3 pr-4 text-right">
                          {item.isPrimaryAdmin ? (
                            <span className="text-[11px] text-slate-600 italic">{t('primaryAdmin')}</span>
                          ) : currentUser?.email && item.email.toLowerCase() === currentUser.email.toLowerCase() ? (
                            <span className="text-[11px] text-slate-500 italic">บัญชีปัจจุบัน</span>
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
        </>
      )}

      {/* TAB 2: Invite Requests */}
      {activeTab === 'requests' && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <span>คำขอสิทธิ์เข้าใช้งานระบบ (Invite Requests)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                รายการผู้ใช้งานที่เข้าสู่ระบบด้วย Google แต่ไม่มีสิทธิ์ และได้ส่งคำขอเพื่อขอเข้าร่วมใช้งาน
              </p>
            </div>

            {/* Search Bar */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchRequests}
                onChange={(e) => setSearchRequests(e.target.value)}
                placeholder="ค้นหาชื่อ, อีเมล, ข้อความ..."
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          {/* Filter Status Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
            <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
              <Filter className="w-3.5 h-3.5" /> กรองสถานะ:
            </span>
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => {
              const label =
                st === 'ALL'
                  ? 'ทั้งหมด'
                  : st === 'PENDING'
                  ? `รอการอนุมัติ ${pendingRequestsCount > 0 ? `(${pendingRequestsCount})` : ''}`
                  : st === 'APPROVED'
                  ? 'อนุมัติแล้ว'
                  : 'ปฏิเสธแล้ว';
              const isSelected = requestsFilter === st;
              return (
                <button
                  key={st}
                  onClick={() => setRequestsFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {loadingRequests ? (
            <div className="py-20 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">{t('loading')}</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs space-y-2">
              <Clock className="w-8 h-8 text-slate-600 mx-auto" />
              <p>ไม่พบรายการคำขอเข้าใช้งานในหมวดหมู่นี้</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                  <tr>
                    <th className="p-3 pl-4">ผู้ขอเข้าใช้งาน</th>
                    <th className="p-3">ข้อความ / หมายเหตุ</th>
                    <th className="p-3">สถานะ</th>
                    <th className="p-3">วันที่ส่งคำขอ</th>
                    <th className="p-3 pr-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 pl-4">
                        <div className="flex items-center gap-3">
                          {req.avatar ? (
                            <img
                              src={req.avatar}
                              alt="Avatar"
                              className="w-8 h-8 rounded-full border border-slate-700 object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center flex-shrink-0 text-xs">
                              {(req.name || req.email || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            {req.name && (
                              <p className="font-semibold text-slate-100 truncate">{req.name}</p>
                            )}
                            <p className="font-mono text-slate-400 text-[11px] truncate">{req.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-slate-300 max-w-xs">
                        {req.note ? (
                          <span className="text-slate-200 line-clamp-2">{req.note}</span>
                        ) : (
                          <span className="italic text-slate-600">ไม่มีข้อความเพิ่มเติม</span>
                        )}
                      </td>

                      <td className="p-3">
                        {req.status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3 animate-spin" /> รอการอนุมัติ
                          </span>
                        ) : req.status === 'APPROVED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" /> อนุมัติแล้ว
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                            <XCircle className="w-3 h-3" /> ปฏิเสธแล้ว
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-slate-400 font-mono">
                        {new Date(req.createdAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="p-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {req.status === 'PENDING' ? (
                            <>
                              <button
                                onClick={() => handleApproveRequest(req.id, 'USER')}
                                disabled={processingRequestId === req.id}
                                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                                title="อนุมัติให้เป็นผู้ใช้ทั่วไป"
                              >
                                {processingRequestId === req.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                <span>อนุมัติ (USER)</span>
                              </button>

                              <button
                                onClick={() => handleApproveRequest(req.id, 'ADMIN')}
                                disabled={processingRequestId === req.id}
                                className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                                title="อนุมัติให้เป็นผู้ดูแลระบบ"
                              >
                                <Shield className="w-3 h-3" />
                                <span>(ADMIN)</span>
                              </button>

                              <button
                                onClick={() => handleRejectRequest(req.id)}
                                disabled={processingRequestId === req.id}
                                className="flex items-center gap-1 px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                                title="ปฏิเสธคำขอ"
                              >
                                <X className="w-3 h-3" />
                                <span>ปฏิเสธ</span>
                              </button>
                            </>
                          ) : req.status === 'REJECTED' ? (
                            <button
                              onClick={() => handleApproveRequest(req.id, 'USER')}
                              disabled={processingRequestId === req.id}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                            >
                              <Check className="w-3 h-3" />
                              <span>เปลี่ยนใจอนุมัติ</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-400/80 mr-2 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> อยู่ใน Whitelist แล้ว
                            </span>
                          )}

                          <button
                            onClick={() => handleDeleteRequest(req.id, req.email)}
                            disabled={processingRequestId === req.id}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-lg transition-all disabled:opacity-50"
                            title="ลบคำขอนี้"
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
          )}
        </div>
      )}

      {/* Role change confirm modal */}
      {pendingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => (togglingEmail ? null : setPendingRole(null))}
          />
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                <UserCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-100">{t('roleChangeConfirmTitle')}</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('roleChangeConfirmMsg')}{' '}
              <span className="font-mono font-semibold text-slate-200">{pendingRole.email}</span>{' '}
              {t('roleChangeConfirmTo')}{' '}
              <span className="font-bold text-amber-300">{pendingRole.target}</span>
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingRole(null)}
                disabled={!!togglingEmail}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={confirmRoleChange}
                disabled={!!togglingEmail}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-amber-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md shadow-amber-500/20 disabled:opacity-50"
              >
                {togglingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('roleChangeConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
