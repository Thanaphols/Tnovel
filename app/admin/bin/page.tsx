'use client';

import React, { useState, useEffect } from 'react';
import {
  Trash2,
  RotateCcw,
  BookOpen,
  FileText,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  CheckSquare,
  Square,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import { useLanguage } from '@/lib/languageContext';

interface BinItemSelection {
  type: 'novel' | 'chapter';
  id: string;
}

function BinNovelCover({ coverUrl, title, isList = false }: { coverUrl?: string | null; title: string; isList?: boolean }) {
  const [imgError, setImgError] = useState(false);

  if (isList) {
    if (coverUrl && !imgError) {
      return (
        <img
          src={coverUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-10 h-14 object-cover rounded-lg flex-shrink-0 border border-slate-800"
        />
      );
    }
    return (
      <div className="w-10 h-14 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center flex-shrink-0">
        <BookOpen className="w-5 h-5 text-amber-500/60" />
      </div>
    );
  }

  if (coverUrl && !imgError) {
    return (
      <img
        src={coverUrl}
        alt={title}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-3 bg-slate-950 text-center">
      <BookOpen className="w-8 h-8 text-slate-600 mb-2" />
      <p className="text-[11px] font-bold text-slate-300 line-clamp-2 px-1">
        {title}
      </p>
    </div>
  );
}

export default function AdminRecycleBinPage() {
  const { t } = useLanguage();
  const [novels, setNovels] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('list');
  const [selectedMap, setSelectedMap] = useState<Record<string, BinItemSelection>>({});

  // Single action delete confirmation
  const [actionItem, setActionItem] = useState<{ type: 'novel' | 'chapter'; id: string; title: string } | null>(null);
  // Batch action delete confirmation
  const [isBatchDeletingModalOpen, setIsBatchDeletingModalOpen] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  useEffect(() => {
    fetchBinItems();
  }, []);

  async function fetchBinItems() {
    setLoading(true);
    try {
      const res = await fetch('/api/bin');
      const data = await res.json();
      if (data.success) {
        setNovels(data.novels || []);
        setChapters(data.chapters || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const totalItemsCount = novels.length + chapters.length;
  const selectedCount = Object.keys(selectedMap).length;
  const isAllSelected = totalItemsCount > 0 && selectedCount === totalItemsCount;

  function toggleItem(type: 'novel' | 'chapter', id: string) {
    const key = `${type}:${id}`;
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = { type, id };
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (isAllSelected) {
      setSelectedMap({});
    } else {
      const next: Record<string, BinItemSelection> = {};
      novels.forEach((n) => {
        next[`novel:${n.id}`] = { type: 'novel', id: n.id };
      });
      chapters.forEach((c) => {
        next[`chapter:${c.id}`] = { type: 'chapter', id: c.id };
      });
      setSelectedMap(next);
    }
  }

  function clearSelection() {
    setSelectedMap({});
  }

  // Single Handlers
  async function handleRestoreSingle(type: 'novel' | 'chapter', id: string) {
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/bin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', type, id }),
      });
      const data = await res.json();
      if (data.success) {
        if (type === 'novel') {
          setNovels((prev) => prev.filter((n) => n.id !== id));
        } else {
          setChapters((prev) => prev.filter((c) => c.id !== id));
        }
        delete selectedMap[`${type}:${id}`];
        setSelectedMap({ ...selectedMap });
      } else {
        alert(data.error || t('restoreError'));
      }
    } catch (err: any) {
      console.error(err);
      alert(t('connectionError') + (err.message || ''));
    } finally {
      setIsProcessingAction(false);
    }
  }

  async function handlePermanentDeleteSingle() {
    if (!actionItem) return;
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/bin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'permanent_delete', type: actionItem.type, id: actionItem.id }),
      });
      const data = await res.json();
      if (data.success) {
        if (actionItem.type === 'novel') {
          setNovels((prev) => prev.filter((n) => n.id !== actionItem.id));
          setChapters((prev) => prev.filter((c) => c.novelId !== actionItem.id));
        } else {
          setChapters((prev) => prev.filter((c) => c.id !== actionItem.id));
        }
        delete selectedMap[`${actionItem.type}:${actionItem.id}`];
        setSelectedMap({ ...selectedMap });
      } else {
        alert(data.error || t('permanentDeleteError'));
      }
    } catch (err: any) {
      console.error(err);
      alert(t('connectionError') + (err.message || ''));
    } finally {
      setIsProcessingAction(false);
      setActionItem(null);
    }
  }

  // Batch Handlers
  async function handleBatchRestore() {
    const selectedList = Object.values(selectedMap);
    if (selectedList.length === 0) return;

    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/bin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', items: selectedList }),
      });
      const data = await res.json();
      if (data.success) {
        const restoredNovelIds = new Set(selectedList.filter((i) => i.type === 'novel').map((i) => i.id));
        const restoredChapterIds = new Set(selectedList.filter((i) => i.type === 'chapter').map((i) => i.id));

        setNovels((prev) => prev.filter((n) => !restoredNovelIds.has(n.id)));
        setChapters((prev) => prev.filter((c) => !restoredChapterIds.has(c.id)));
        setSelectedMap({});
      } else {
        alert(data.error || t('restoreError'));
      }
    } catch (err: any) {
      console.error(err);
      alert(t('connectionError') + (err.message || ''));
    } finally {
      setIsProcessingAction(false);
    }
  }

  async function handleBatchPermanentDelete() {
    const selectedList = Object.values(selectedMap);
    if (selectedList.length === 0) return;

    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/bin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'permanent_delete', items: selectedList }),
      });
      const data = await res.json();
      if (data.success) {
        const deletedNovelIds = new Set(selectedList.filter((i) => i.type === 'novel').map((i) => i.id));
        const deletedChapterIds = new Set(selectedList.filter((i) => i.type === 'chapter').map((i) => i.id));

        setNovels((prev) => prev.filter((n) => !deletedNovelIds.has(n.id)));
        setChapters((prev) => prev.filter((c) => !deletedChapterIds.has(c.id) && !deletedNovelIds.has(c.novelId)));
        setSelectedMap({});
      } else {
        alert(data.error || t('permanentDeleteError'));
      }
    } catch (err: any) {
      console.error(err);
      alert(t('connectionError') + (err.message || ''));
    } finally {
      setIsProcessingAction(false);
      setIsBatchDeletingModalOpen(false);
    }
  }

  const isEmpty = novels.length === 0 && chapters.length === 0;

  return (
    <div className="space-y-6">
      {/* Header Banner & Controls */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex-shrink-0">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">{t('recycleBinTitle')}</h1>
            <p className="text-xs text-slate-400">{t('recycleBinDesc')}</p>
          </div>
        </div>

        {/* View Mode & Refresh */}
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'list' ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('viewListTooltip')}
              >
                <ListIcon className="w-4 h-4" />
                <span>{t('viewList')}</span>
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'card' ? 'bg-amber-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('viewCardTooltip')}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>{t('viewCard')}</span>
              </button>
            </div>
          )}

          <button
            onClick={fetchBinItems}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>{t('refresh')}</span>
          </button>
        </div>
      </div>

      {/* Batch Actions Bar (Visible when items exist) */}
      {!isEmpty && !loading && (
        <div className="p-4 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 sticky top-20 z-20 shadow-xl">
          {/* Select All Checkbox Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all"
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-amber-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>{isAllSelected ? t('deselectAll') : t('selectAll')}</span>
            </button>

            {selectedCount > 0 && (
              <span className="text-xs font-medium text-amber-300 bg-amber-500/10 px-2.5 py-1 border border-amber-500/20 rounded-lg">
                {t('selectedItemsCount')} {selectedCount} {t('itemsUnit')}
              </span>
            )}
          </div>

          {/* Action Buttons for Selected Items */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchRestore}
                disabled={isProcessingAction}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl transition-all disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('restoreSelected')} ({selectedCount})</span>
              </button>

              <button
                onClick={() => setIsBatchDeletingModalOpen(true)}
                disabled={isProcessingAction}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-xl transition-all disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('permanentDeleteSelected')} ({selectedCount})</span>
              </button>

              <button
                onClick={clearSelection}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all"
                title={t('clearSelectionTooltip')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">{t('loadingBinItems')}</p>
        </div>
      ) : isEmpty ? (
        <div className="p-16 text-center bg-slate-900/40 border border-slate-800/60 rounded-3xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto text-slate-500">
            <Trash2 className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-300">{t('emptyBin')}</p>
          <p className="text-xs text-slate-500">{t('emptyBinDesc')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Deleted Novels Section */}
          {novels.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>{t('novelsInBin')} ({novels.length})</span>
              </h2>

              {viewMode === 'card' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {novels.map((novel) => {
                    const isSelected = !!selectedMap[`novel:${novel.id}`];
                    return (
                      <div
                        key={novel.id}
                        onClick={() => toggleItem('novel', novel.id)}
                        className={`group relative flex flex-col bg-slate-900 border rounded-2xl overflow-hidden shadow-lg transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-500/80 bg-amber-950/10 ring-2 ring-amber-500/30'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="relative aspect-[4/4.5] w-full bg-slate-950 overflow-hidden">
                          <BinNovelCover coverUrl={novel.coverUrl} title={novel.titleTh || novel.titleEn} />
                          <div className="absolute top-2 left-2 z-10">
                            <div
                              className={`p-1.5 rounded-lg backdrop-blur-md border transition-all ${
                                isSelected
                                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                                  : 'bg-slate-950/80 text-slate-400 border-slate-700 hover:text-white'
                              }`}
                            >
                              {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                            </div>
                          </div>

                          <div
                            className="absolute top-2 right-2 flex items-center gap-1 z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleRestoreSingle('novel', novel.id)}
                              className="p-1.5 text-emerald-400 hover:text-emerald-300 bg-slate-950/80 hover:bg-emerald-500/20 backdrop-blur-md border border-slate-800 rounded-xl transition-all"
                              title={t('restoreSingleTooltip')}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() =>
                                setActionItem({
                                  type: 'novel',
                                  id: novel.id,
                                  title: novel.titleTh || novel.titleEn,
                                })
                              }
                              className="p-1.5 text-rose-400 hover:text-rose-300 bg-slate-950/80 hover:bg-rose-500/20 backdrop-blur-md border border-slate-800 rounded-xl transition-all"
                              title={t('permanentDeleteSingleTooltip')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
                          <h4 className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug">
                            {novel.titleTh || novel.titleEn}
                          </h4>
                          <p className="text-[10px] text-slate-400 truncate">
                            {novel.author?.name ? `${t('author')}: ${novel.author.name}` : t('unknownAuthor')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {novels.map((novel) => {
                    const isSelected = !!selectedMap[`novel:${novel.id}`];
                    return (
                      <div
                        key={novel.id}
                        onClick={() => toggleItem('novel', novel.id)}
                        className={`p-3 sm:p-4 bg-slate-900 border rounded-2xl flex items-center justify-between gap-3 sm:gap-4 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-500/80 bg-amber-950/15 ring-1 ring-amber-500/30'
                            : 'border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`p-1 rounded-lg border transition-all flex-shrink-0 ${
                              isSelected
                                ? 'bg-amber-400 text-slate-950 border-amber-300'
                                : 'bg-slate-950 text-slate-400 border-slate-700'
                            }`}
                          >
                            {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                          </div>

                          <BinNovelCover coverUrl={novel.coverUrl} title={novel.titleTh || novel.titleEn} isList={true} />

                          <div className="truncate">
                            <h4 className="text-sm font-bold text-slate-200 truncate">
                              {novel.titleTh || novel.titleEn}
                            </h4>
                            <p className="text-xs text-slate-400 truncate">
                              {novel.author?.name ? `${t('author')}: ${novel.author.name}` : t('unknownAuthor')}
                            </p>
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-2 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleRestoreSingle('novel', novel.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{t('restore')}</span>
                          </button>
                          <button
                            onClick={() =>
                              setActionItem({
                                type: 'novel',
                                id: novel.id,
                                title: novel.titleTh || novel.titleEn,
                              })
                            }
                            className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-all"
                            title={t('permanentDeleteSingleTooltip')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Deleted Chapters Section */}
          {chapters.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-rose-400" />
                <span>{t('chaptersInBin')} ({chapters.length})</span>
              </h2>

              <div className="space-y-2">
                {chapters.map((chap) => {
                  const isSelected = !!selectedMap[`chapter:${chap.id}`];
                  return (
                    <div
                      key={chap.id}
                      onClick={() => toggleItem('chapter', chap.id)}
                      className={`p-3 sm:p-4 bg-slate-900 border rounded-2xl flex items-center justify-between gap-3 sm:gap-4 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-amber-500/80 bg-amber-950/15 ring-1 ring-amber-500/30'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-1 rounded-lg border transition-all flex-shrink-0 ${
                            isSelected
                              ? 'bg-amber-400 text-slate-950 border-amber-300'
                              : 'bg-slate-950 text-slate-400 border-slate-700'
                          }`}
                        >
                          {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                        </div>

                        <div className="truncate">
                          <h4 className="text-sm font-semibold text-slate-200 truncate">
                            {chap.titleTh || chap.titleEn}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">
                            {t('novelStoryPrefix')} {chap.novel?.titleTh || chap.novel?.titleEn || '-'}
                          </p>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-2 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleRestoreSingle('chapter', chap.id)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{t('restore')}</span>
                        </button>
                        <button
                          onClick={() =>
                            setActionItem({
                              type: 'chapter',
                              id: chap.id,
                              title: chap.titleTh || chap.titleEn,
                            })
                          }
                          className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl transition-all"
                          title={t('permanentDeleteSingleTooltip')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Single Permanent Delete */}
      {actionItem && (
        <ConfirmDeleteModal
          isOpen={true}
          title={`${t('confirmPermanentDeleteSingleTitle')}: "${actionItem.title}"`}
          message={t('confirmPermanentDeleteSingleMsg')}
          confirmLabel={t('confirmDeleteButton')}
          isLoading={isProcessingAction}
          onConfirm={handlePermanentDeleteSingle}
          onClose={() => setActionItem(null)}
        />
      )}

      {/* Confirmation Modal for Batch Permanent Delete */}
      {isBatchDeletingModalOpen && (
        <ConfirmDeleteModal
          isOpen={true}
          title={`${t('confirmPermanentDeleteBatchTitle')} (${selectedCount} ${t('itemsUnit')})`}
          message={t('confirmPermanentDeleteBatchMsg')}
          confirmLabel={`${t('permanentDeleteSelected')} (${selectedCount})`}
          isLoading={isProcessingAction}
          onConfirm={handleBatchPermanentDelete}
          onClose={() => setIsBatchDeletingModalOpen(false)}
        />
      )}
    </div>
  );
}
