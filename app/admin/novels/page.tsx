'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Search,
  RotateCcw,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { useLanguage } from '@/lib/languageContext';

export default function AdminNovelsPage() {
  const { t } = useLanguage();
  const [novels, setNovels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchNovel, setSearchNovel] = useState('');
  const [deleteModalItem, setDeleteModalItem] = useState<{ id: string; title: string; action: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchNovels();
  }, []);

  async function fetchNovels() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/novels');
      const data = await res.json();
      if (data.success) {
        setNovels(data.novels || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

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

  const filteredNovels = novels.filter((n) =>
    (n.titleTh + n.titleEn + (n.author?.name || '')).toLowerCase().includes(searchNovel.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('adminTabNovels')}</h1>
            <p className="text-xs text-slate-400">จัดการข้อมูลนิยาย จำนวนตอน สถานะ และลบ/กู้คืนเนื้อหา</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
            <span className="text-slate-400">ทั้งหมด: </span>
            <span className="text-amber-400 font-bold">{novels.length} {t('storiesUnit')}</span>
          </div>
          <button
            onClick={fetchNovels}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>{t('refresh')}</span>
          </button>
        </div>
      </div>

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
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">{t('loading')}</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="text-slate-400 uppercase bg-slate-950/60 border-b border-slate-800">
                <tr>
                  <th className="p-4 pl-5">{t('thNovel')}</th>
                  <th className="p-4">{t('thAuthor')}</th>
                  <th className="p-4">{t('thChaptersCount')}</th>
                  <th className="p-4">{t('thReports')}</th>
                  <th className="p-4">{t('thStatus')}</th>
                  <th className="p-4 pr-5 text-right">{t('thAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredNovels.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 text-xs">
                      ไม่พบนิยายที่ค้นหา
                    </td>
                  </tr>
                ) : (
                  filteredNovels.map((novel) => (
                    <tr key={novel.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 pl-5">
                        <div className="font-bold text-slate-100 text-sm">{novel.titleTh || novel.titleEn}</div>
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
                      <td className="p-4 font-semibold text-amber-300">
                        {novel._count?.chapters || 0} {t('chaptersCount')}
                      </td>
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
                      <td className="p-4 pr-5 text-right">
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Permanent Delete Modal */}
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
