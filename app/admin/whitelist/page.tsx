'use client';

import React, { useState, useEffect } from 'react';
import { MailCheck, Mail, Plus, UserCheck, Search, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

export default function AdminWhitelistPage() {
  const { t, lang } = useLanguage();
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchWhitelist, setSearchWhitelist] = useState('');

  // Form states
  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [addingWhitelist, setAddingWhitelist] = useState(false);
  const [whitelistMsg, setWhitelistMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingWhitelistId, setDeletingWhitelistId] = useState<string | null>(null);

  useEffect(() => {
    fetchWhitelist();
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

  const filteredWhitelist = whitelist.filter((item) =>
    (item.email + (item.note || '')).toLowerCase().includes(searchWhitelist.toLowerCase())
  );

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
            <p className="text-xs text-slate-400">กำหนดรายชื่ออีเมลที่ได้รับอนุญาตให้เข้าสู่ระบบ (Whitelist)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
            <span className="text-slate-400">ทั้งหมด: </span>
            <span className="text-amber-400 font-bold">{whitelist.length} รายการ</span>
          </div>
          <button
            onClick={fetchWhitelist}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>{t('refresh')}</span>
          </button>
        </div>
      </div>

      {/* Form to Add Whitelist Email */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Plus className="w-5 h-5 text-amber-400" /> {t('addWhitelistTitle')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{t('addWhitelistDesc')}</p>
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
  );
}
