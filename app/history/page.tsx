'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  History,
  BookOpen,
  Play,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  RotateCcw,
  Trash2,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Filter,
  Layers,
} from 'lucide-react';
import { useSocket } from '@/lib/socket';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import UrlScrapeDrawer from '@/components/UrlScrapeDrawer';
import { useLanguage } from '@/lib/languageContext';

interface HistoryNovel {
  id: string;
  titleEn: string;
  titleTh: string;
  description: string | null;
  coverUrl: string | null;
  sourceUrl: string;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string | null; email: string | null } | null;
  chapterCount: number;
  totalChapters: number;
  percent: number;
  translationStatus: 'TRANSLATING' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
  firstChapterId: string | null;
  latestChapterId: string | null;
  isMine: boolean;
}

export default function HistoryPage() {
  const [novels, setNovels] = useState<HistoryNovel[]>([]);
  const [counts, setCounts] = useState({ all: 0, translating: 0, completed: 0 });
  const [filter, setFilter] = useState<'all' | 'translating' | 'completed'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryNovel | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScrapeOpen, setIsScrapeOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { socket } = useSocket();
  const { t, lang } = useLanguage();

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (search.trim()) params.set('q', search.trim());

      const res = await fetch(`/api/novels/history?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setNovels(data.novels || []);
        if (data.counts) setCounts(data.counts);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Check active translation job
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/translation/status');
        const data = await res.json();
        if (data.success && data.active && data.job) {
          setActiveJobId(data.job.novelId || null);
        } else {
          setActiveJobId(null);
        }
      } catch {}
    }
    checkStatus();
  }, []);

  // Listen to socket updates for real-time progress & chapter increments
  useEffect(() => {
    if (!socket) return;

    function handleProgress(data: any) {
      if (data.novelId) {
        setActiveJobId(data.novelId);
        setNovels((prev) =>
          prev.map((n) => {
            if (n.id === data.novelId) {
              const currentChap = data.currentChapter || n.chapterCount;
              const total = data.totalChapters || n.totalChapters;
              return {
                ...n,
                chapterCount: currentChap,
                totalChapters: total,
                percent: data.percent || Math.round((currentChap / total) * 100),
                translationStatus: 'TRANSLATING',
              };
            }
            return n;
          })
        );
      } else if (data.status === 'batch_completed' || data.status === 'batch_cancelled') {
        setActiveJobId(null);
        fetchHistory();
      }
    }

    function handleChapterCreated(data: any) {
      if (data.novelId) {
        setNovels((prev) =>
          prev.map((n) => {
            if (n.id === data.novelId) {
              const newCount = n.chapterCount + 1;
              const percent = Math.min(100, Math.round((newCount / (n.totalChapters || newCount)) * 100));
              return {
                ...n,
                chapterCount: newCount,
                percent,
                firstChapterId: n.firstChapterId || data.chapterId,
                latestChapterId: data.chapterId,
              };
            }
            return n;
          })
        );
      }
    }

    socket.on('translation:progress', handleProgress);
    socket.on('chapter:created', handleChapterCreated);

    return () => {
      socket.off('translation:progress', handleProgress);
      socket.off('chapter:created', handleChapterCreated);
    };
  }, [socket, fetchHistory]);

  async function handleResume(novel: HistoryNovel) {
    if (resumingId) return;
    setResumingId(novel.id);

    try {
      const res = await fetch(`/api/novels/${novel.id}/resume`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || t('resumeError'));
      } else {
        setActiveJobId(novel.id);
        fetchHistory();
      }
    } catch (err: any) {
      console.error(err);
      alert(t('networkError'));
    } finally {
      setResumingId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/novels/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setNovels((prev) => prev.filter((n) => n.id !== deleteTarget.id));
        setCounts((prev) => ({
          ...prev,
          all: Math.max(0, prev.all - 1),
          translating:
            deleteTarget.chapterCount < deleteTarget.totalChapters
              ? Math.max(0, prev.translating - 1)
              : prev.translating,
          completed:
            deleteTarget.chapterCount >= deleteTarget.totalChapters
              ? Math.max(0, prev.completed - 1)
              : prev.completed,
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 md:pb-16">
      {/* Top Hero Section */}
      <div className="hero-banner relative overflow-hidden border-b border-slate-800/80 px-4 py-8 sm:py-10">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="hero-badge inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold">
                <History className="w-3.5 h-3.5" />
                <span>{t('historyTitle')}</span>
              </div>
              <h1 className="hero-title text-xl sm:text-2xl font-black tracking-tight">
                {t('historySubTitle')}
              </h1>
              <p className="hero-desc text-xs sm:text-sm">
                {t('historyDesc')}
              </p>
            </div>

            <button
              onClick={() => setIsScrapeOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all self-start sm:self-auto"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t('btnTranslateNew')}</span>
            </button>
          </div>

          {/* Search & Filter Tabs */}
          <div className="pt-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl self-start overflow-x-auto max-w-full">
              <button
                onClick={() => setFilter('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  filter === 'all'
                    ? 'bg-amber-400 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{t('filterAll')}</span>
                <span className={`px-1.5 py-0.2 text-[10px] rounded-md ${filter === 'all' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`}>
                  {counts.all}
                </span>
              </button>

              <button
                onClick={() => setFilter('translating')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  filter === 'translating'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{t('filterTranslating')}</span>
                <span className={`px-1.5 py-0.2 text-[10px] rounded-md ${filter === 'translating' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-amber-400'}`}>
                  {counts.translating}
                </span>
              </button>

              <button
                onClick={() => setFilter('completed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  filter === 'completed'
                    ? 'bg-emerald-400 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t('filterCompleted')}</span>
                <span className={`px-1.5 py-0.2 text-[10px] rounded-md ${filter === 'completed' ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-emerald-400'}`}>
                  {counts.completed}
                </span>
              </button>
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('historySearchPlaceholder')}
                className="hero-search w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Novel List */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs">{t('historyLoading')}</p>
          </div>
        ) : novels.length === 0 ? (
          <div className="py-20 text-center space-y-4 max-w-sm mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
              <History className="w-8 h-8 opacity-60" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-200">{t('historyEmpty')}</h3>
              <p className="text-xs text-slate-500">
                {filter === 'translating'
                  ? t('historyEmptyTranslating')
                  : filter === 'completed'
                  ? t('historyEmptyCompleted')
                  : t('historyEmptyAll')}
              </p>
            </div>
            <button
              onClick={() => setIsScrapeOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t('btnStartFirstNovel')}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {novels.map((novel) => {
              const isCurrentlyTranslating = activeJobId === novel.id;
              const isCompleted =
                novel.translationStatus === 'COMPLETED' ||
                (novel.totalChapters > 0 && novel.chapterCount >= novel.totalChapters);
              const isPausedOrCancelled = !isCompleted && !isCurrentlyTranslating;

              return (
                <div
                  key={novel.id}
                  className="group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl shadow-lg transition-all"
                >
                  {/* Left: Thumbnail & Info */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Cover Thumbnail */}
                    <div className="relative w-16 h-22 sm:w-16 sm:h-22 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0 border border-slate-800">
                      {novel.coverUrl ? (
                        <img
                          src={novel.coverUrl}
                          alt={novel.titleTh || novel.titleEn}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-950 text-amber-500/60">
                          <BookOpen className="w-6 h-6" />
                        </div>
                      )}

                      {/* Status indicator on thumbnail */}
                      {isCurrentlyTranslating && (
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Novel Text Details */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Status Badge */}
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> {t('statusCompleted')}
                          </span>
                        ) : isCurrentlyTranslating ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400">
                            <Loader2 className="w-3 h-3 animate-spin" /> {t('translating')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300">
                            <Clock className="w-3 h-3" /> {t('statusPaused')}
                          </span>
                        )}

                        <span className="text-[11px] text-slate-500">
                          {new Date(novel.updatedAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-slate-100 line-clamp-1 group-hover:text-amber-300 transition-colors">
                        {novel.titleTh || novel.titleEn}
                      </h3>

                      <p className="text-xs text-slate-400 line-clamp-1">
                        {novel.titleEn} {novel.author ? `• ${t('authorTitle')}${novel.author.name}` : ''}
                      </p>

                      {/* Progress Bar & Chapter Counts */}
                      <div className="pt-1 space-y-1 max-w-md">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-slate-400">
                            {t('translatedCountLabel')}<strong className="text-amber-400">{novel.chapterCount}</strong> / {novel.totalChapters} {t('chaptersCount')}
                          </span>
                          <span className={isCompleted ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                            {novel.percent}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isCompleted
                                ? 'bg-emerald-400'
                                : 'bg-amber-400'
                            }`}
                            style={{ width: `${novel.percent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0 pt-2 sm:pt-0">
                    {/* Resume Translation Button */}
                    {isPausedOrCancelled && (
                      <button
                        onClick={() => handleResume(novel)}
                        disabled={resumingId === novel.id || Boolean(activeJobId)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition-all"
                        title={t('resumeTranslateTooltip')}
                      >
                        {resumingId === novel.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>{t('btnResume')}</span>
                      </button>
                    )}

                    {/* Read Button */}
                    {novel.firstChapterId && (
                      <Link
                        href={`/reader/${novel.firstChapterId}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs rounded-xl border border-slate-700 transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('btnReadNovel')}</span>
                      </Link>
                    )}

                    {/* Source Link */}
                    {novel.sourceUrl && (
                      <a
                        href={novel.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-slate-400 hover:text-slate-200 bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors"
                        title={t('openOriginalWebTooltip')}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    {/* Delete Button */}
                    <button
                      onClick={() => setDeleteTarget(novel)}
                      className="p-2 text-slate-400 hover:text-rose-400 bg-slate-950/80 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 rounded-xl transition-colors"
                      title={t('moveToBin')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Delete */}
      <ConfirmDeleteModal
        isOpen={Boolean(deleteTarget)}
        title={`${t('confirmMoveToBinTitle')} "${deleteTarget?.titleTh || deleteTarget?.titleEn}"`}
        message={t('confirmMoveToBinMsg')}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />

      {/* URL Scraper Drawer */}
      <UrlScrapeDrawer isOpen={isScrapeOpen} onClose={() => setIsScrapeOpen(false)} />
    </div>
  );
}
