'use client';

import React, { useState, useEffect, useRef } from 'react';
import NovelCard from '@/components/NovelCard';
import NovelCardSkeleton from '@/components/NovelCardSkeleton';
import { useSocket } from '@/lib/socket';
import { useLanguage } from '@/lib/languageContext';
import { Sparkles, BookOpen, Search, Filter } from 'lucide-react';

interface NovelItem {
  id: string;
  titleEn: string;
  titleTh: string;
  coverUrl?: string | null;
  author?: { id: string; name: string } | null;
  createdBy?: { id: string; name?: string | null; email?: string | null; avatar?: string | null } | null;
  chapterCount: number;
  totalChapters?: number;
  translationStatus?: string;
  chapters?: Array<{ id: string; chapterNumber: number; titleTh: string }>;
  viewCount?: number;
  likeCount?: number;
  liked?: boolean;
  progress?: number;
}

export default function HomePage() {
  const [novels, setNovels] = useState<NovelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { socket } = useSocket();
  const { t } = useLanguage();

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Initial Fetch (8 novel cards) + Auto-refresh on focus and custom refresh events
  useEffect(() => {
    fetchNovels(false);

    function handleFocus() {
      fetchNovels(false);
    }
    function handleRefresh() {
      fetchNovels(false);
    }

    window.addEventListener('focus', handleFocus);
    window.addEventListener('novels:refresh', handleRefresh);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('novels:refresh', handleRefresh);
    };
  }, []);

  // Socket.io Real-time Event Listeners
  useEffect(() => {
    if (!socket) return;

    function handleNovelCreated() {
      fetchNovels(false);
    }

    function handleChapterCreated(data: any) {
      if (!data?.novelId) {
        fetchNovels(false);
        return;
      }

      setNovels((prev) =>
        prev.map((n) => {
          if (n.id === data.novelId) {
            const updatedChapters = n.chapters ? [...n.chapters] : [];
            if (data.chapterId && !updatedChapters.some((c) => c.id === data.chapterId)) {
              updatedChapters.push({
                id: data.chapterId,
                chapterNumber: data.chapterNumber || updatedChapters.length + 1,
                titleTh: data.chapterTitle || `ตอนที่ ${updatedChapters.length + 1}`,
              });
            }
            return {
              ...n,
              chapterCount:
                typeof data.chapterCount === 'number' ? data.chapterCount : updatedChapters.length,
              chapters: updatedChapters,
            };
          }
          return n;
        })
      );
    }

    function handleNovelDeleted(data: { id: string }) {
      setNovels((prev) => prev.filter((n) => n.id !== data.id));
    }

    function handleItemRestored() {
      fetchNovels(false);
    }

    function handleTranslationProgress(data: any) {
      if (data?.novelId) {
        setNovels((prev) =>
          prev.map((n) => {
            if (n.id === data.novelId) {
              return {
                ...n,
                chapterCount:
                  typeof data.chapterCount === 'number' ? data.chapterCount : n.chapterCount,
                totalChapters: data.totalChapters || n.totalChapters,
                translationStatus: 'TRANSLATING',
              };
            }
            return n;
          })
        );
      } else if (data.status === 'completed' || data.status === 'batch_completed') {
        fetchNovels(false);
      }
    }

    socket.on('novel:created', handleNovelCreated);
    socket.on('chapter:created', handleChapterCreated);
    socket.on('novel:deleted', handleNovelDeleted);
    socket.on('item:restored', handleItemRestored);
    socket.on('translation:progress', handleTranslationProgress);

    return () => {
      socket.off('novel:created', handleNovelCreated);
      socket.off('chapter:created', handleChapterCreated);
      socket.off('novel:deleted', handleNovelDeleted);
      socket.off('item:restored', handleItemRestored);
      socket.off('translation:progress', handleTranslationProgress);
    };
  }, [socket]);

  async function fetchNovels(showSpinner = false) {
    if (showSpinner) setLoading(true);

    try {
      const res = await fetch(`/api/novels?limit=8`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success) {
        setNovels(data.items || []);
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const res = await fetch(`/api/novels?limit=8&cursor=${nextCursor}`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success) {
        setNovels((prev) => [...prev, ...(data.items || [])]);
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  }

  // Infinite Scroll IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, nextCursor, loading]);

  const handleNovelDelete = (deletedId: string) => {
    setNovels((prev) => prev.filter((n) => n.id !== deletedId));
  };

  const filteredNovels = novels.filter((n) => {
    const titleTh = n.titleTh || '';
    const titleEn = n.titleEn || '';
    const authorName = n.author?.name || '';
    const createdByName = n.createdBy?.name || n.createdBy?.email || '';
    return (titleTh + titleEn + authorName + createdByName).toLowerCase().includes((searchQuery || '').trim().toLowerCase());
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="hero-banner relative p-6 sm:p-8 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-3">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="hero-badge inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full">
          <Sparkles className="w-3.5 h-3.5" /> {t('heroBadge')}
        </div>
        <h1 className="hero-title text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
          {t('heroTitle')}{' '}
          <span className="hero-gemini-gradient text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
            Gemini AI
          </span>
        </h1>
        <p className="hero-desc text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
          {t('heroDesc')}
        </p>

        {/* Search Bar */}
        <div className="pt-2 max-w-md relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="hero-search w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-950/80 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/50 text-slate-100 placeholder:text-slate-500 transition-all"
          />
        </div>
      </div>

      {/* Main Novel Grid Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <span>{t('latestNovels')}</span>
            {!loading && <span className="text-xs font-semibold text-slate-400">({filteredNovels.length})</span>}
          </h2>
        </div>

        {loading ? (
          /* Centered Circular Loading Screen */
          <div className="min-h-[380px] flex flex-col items-center justify-center p-8 bg-slate-900/40 border border-slate-800/80 rounded-3xl space-y-4 shadow-xl">
            <div className="relative flex items-center justify-center">
              {/* Glowing Aura */}
              <div className="absolute w-24 h-24 bg-amber-500/20 rounded-full blur-2xl animate-pulse" />
              {/* Outer Spin Ring */}
              <div className="w-16 h-16 border-4 border-slate-800 border-t-amber-400 border-r-amber-400/50 rounded-full animate-spin" />
              {/* Inner Center Icon */}
              <div className="absolute inset-0 flex items-center justify-center text-amber-400">
                <BookOpen className="w-6 h-6 animate-pulse" />
              </div>
            </div>

            <div className="text-center space-y-1 pt-1">
              <h3 className="text-sm sm:text-base font-bold text-slate-100">
                {t('loadingNovels')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('loadingNovelsSub')}
              </p>
            </div>
          </div>
        ) : filteredNovels.length === 0 ? (
          /* Empty State */
          <div className="p-12 text-center bg-slate-900/40 border border-slate-800/60 rounded-3xl space-y-3">
            <BookOpen className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-semibold text-slate-300">{t('noNovels')}</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {t('noNovelsDesc')}
            </p>
          </div>
        ) : (
          /* Mobile-First Novel Grid (2 cards per row on mobile, 3-4 on desktop) */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {filteredNovels.map((novel) => (
              <NovelCard
                key={novel.id}
                id={novel.id}
                titleEn={novel.titleEn}
                titleTh={novel.titleTh}
                coverUrl={novel.coverUrl}
                author={novel.author}
                createdBy={novel.createdBy}
                chapterCount={novel.chapterCount}
                totalChapters={novel.totalChapters}
                translationStatus={novel.translationStatus}
                chapters={novel.chapters}
                viewCount={novel.viewCount}
                likeCount={novel.likeCount}
                liked={novel.liked}
                progress={novel.progress}
                onDelete={handleNovelDelete}
              />
            ))}

            {/* Preload skeletons during infinite scroll load */}
            {loadingMore &&
              Array.from({ length: 4 }).map((_, idx) => (
                <NovelCardSkeleton key={`skeleton-${idx}`} />
              ))}
          </div>
        )}

        {/* Infinite Scroll Sentinel Anchor */}
        <div ref={sentinelRef} className="h-10 flex items-center justify-center pt-4">
          {loadingMore && (
            <span className="inline-flex items-center gap-2 text-xs text-amber-400">
              <span className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              กำลังโหลดนิยายเพิ่มเติม...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
