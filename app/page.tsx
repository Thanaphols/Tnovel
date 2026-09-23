'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import NovelCardSkeleton from '@/components/NovelCardSkeleton';
import RecentReadingPlaceholder from '@/components/RecentReadingPlaceholder';
import { useSocket } from '@/lib/socket';
import { useLanguage } from '@/lib/languageContext';
import { Sparkles, BookOpen, Search, Filter, X } from 'lucide-react';
import { NOVEL_CATEGORIES, getCategoryLabel } from '@/lib/categories';

const NovelCard = dynamic(() => import('@/components/NovelCard'), {
  ssr: false,
  loading: () => <NovelCardSkeleton />,
});

const RecentReadingRow = dynamic(() => import('@/components/RecentReadingRow'), {
  ssr: false,
  loading: () => <RecentReadingPlaceholder />,
});

interface NovelItem {
  id: string;
  titleEn: string;
  titleTh: string;
  coverUrl?: string | null;
  category?: string | null;
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
  const [totalNovels, setTotalNovels] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const { socket } = useSocket();
  const { t, lang } = useLanguage();

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Mouse drag-to-scroll for the category pills (touch devices scroll natively)
  const catRowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ down: false, startX: 0, startScroll: 0, moved: false });
  const onCatDragStart = (e: React.MouseEvent) => {
    const el = catRowRef.current;
    if (!el) return;
    dragRef.current = { down: true, startX: e.pageX, startScroll: el.scrollLeft, moved: false };
  };
  const onCatDragMove = (e: React.MouseEvent) => {
    const el = catRowRef.current;
    if (!el || !dragRef.current.down) return;
    const dx = e.pageX - dragRef.current.startX;
    if (Math.abs(dx) > 4) dragRef.current.moved = true;
    el.scrollLeft = dragRef.current.startScroll - dx;
  };
  const endCatDrag = () => { dragRef.current.down = false; };
  // Suppress the click that follows a drag so we don't select a category by accident
  const onCatClickCapture = (e: React.MouseEvent) => {
    if (dragRef.current.moved) { e.stopPropagation(); e.preventDefault(); }
  };

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
                titleTh: data.chapterTitle || `${t('chapterPrefix')} ${updatedChapters.length + 1}`,
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

  async function fetchNovels(showSpinner = false, categoryToFetch?: string) {
    if (showSpinner) setLoading(true);
    const cat = typeof categoryToFetch === 'string' ? categoryToFetch : selectedCategory;

    try {
      const catParam = cat && cat !== 'ALL' ? `&category=${encodeURIComponent(cat)}` : '';
      const res = await fetch(`/api/novels?limit=10${catParam}`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success) {
        setNovels(data.items || []);
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
        if (typeof data.total === 'number') {
          setTotalNovels(data.total);
        }
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
      const catParam = selectedCategory && selectedCategory !== 'ALL' ? `&category=${encodeURIComponent(selectedCategory)}` : '';
      const res = await fetch(`/api/novels?limit=10&cursor=${nextCursor}${catParam}`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success) {
        setNovels((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newItems = (data.items || []).filter((n: NovelItem) => !existingIds.has(n.id));
          return [...prev, ...newItems];
        });
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
        if (typeof data.total === 'number') {
          setTotalNovels(data.total);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  }

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    fetchNovels(true, catId);
  };

  // Infinite Scroll IntersectionObserver (loads more on scroll down)
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.05, rootMargin: '250px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, nextCursor, loading, selectedCategory]);

  const handleNovelDelete = (deletedId: string) => {
    setNovels((prev) => prev.filter((n) => n.id !== deletedId));
  };

  const filteredNovels = novels.filter((n) => {
    const titleTh = n.titleTh || '';
    const titleEn = n.titleEn || '';
    const authorName = n.author?.name || '';
    const createdByName = n.createdBy?.name || n.createdBy?.email || '';
    const categoryName = getCategoryLabel(n.category, lang);
    return (titleTh + titleEn + authorName + createdByName + categoryName)
      .toLowerCase()
      .includes((searchQuery || '').trim().toLowerCase());
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6" suppressHydrationWarning>
      {/* Header Banner */}
      <div className="hero-banner relative p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md space-y-3">
        <div className="hero-badge inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Sparkles className="w-3.5 h-3.5" /> {t('heroBadge')}
        </div>
        <h1 className="hero-title text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
          {t('heroTitle')}{' '}
          <span className="hero-ai-accent font-extrabold">
            Tnovel
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
            className="hero-search w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500 text-slate-100 placeholder:text-slate-500 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
              aria-label={t('clearSearch')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Recent Reading Row (Horizontal Scroll) */}
      <RecentReadingRow />

      {/* Category Filter Pills (Horizontal Scrollable + mouse drag) */}
      <div
        ref={catRowRef}
        onMouseDown={onCatDragStart}
        onMouseMove={onCatDragMove}
        onMouseUp={endCatDrag}
        onMouseLeave={endCatDrag}
        onClickCapture={onCatClickCapture}
        className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs cursor-grab active:cursor-grabbing select-none">
        <button
          type="button"
          onClick={() => handleCategoryChange('ALL')}
          className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all ${
            selectedCategory === 'ALL'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          {t('allCategories')}
        </button>
        {NOVEL_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              type="button"
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold shrink-0 transition-all ${
                isActive
                  ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {lang === 'en' ? cat.nameEn : cat.nameTh}
            </button>
          );
        })}
      </div>

      {/* Main Novel Grid Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <span>{t('latestNovels')}</span>
            {!loading && (
              <span className="text-xs font-semibold text-slate-400">
                ({filteredNovels.length}
                {totalNovels && !searchQuery && totalNovels > filteredNovels.length ? ` / ${totalNovels}` : ''})
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          /* Centered Circular Loading Screen */
          <div className="min-h-[380px] flex flex-col items-center justify-center p-8 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
            <div className="relative flex items-center justify-center">
              {/* Outer Spin Ring */}
              <div className="w-16 h-16 border-4 border-slate-800 border-t-amber-400 rounded-full animate-spin" />
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
            <h3 className="text-base font-semibold text-slate-300">
              {searchQuery ? `ไม่พบผลการค้นหา` : t('noNovels')}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery ? `ไม่พบนิยายที่ตรงกับ "${searchQuery}"` : t('noNovelsDesc')}
            </p>
          </div>
        ) : (
          /* Mobile-First Novel Grid (Dense, compact cards across all viewports) */
          <div className="grid grid-cols-2 min-[440px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-2.5">
            {filteredNovels.map((novel) => (
              <NovelCard
                key={novel.id}
                id={novel.id}
                titleEn={novel.titleEn}
                titleTh={novel.titleTh}
                coverUrl={novel.coverUrl}
                category={novel.category}
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
              Array.from({ length: 10 }).map((_, idx) => (
                <NovelCardSkeleton key={`skeleton-${idx}`} />
              ))}
          </div>
        )}

        {/* Infinite Scroll Sentinel Anchor */}
        <div ref={sentinelRef} className="py-6 flex flex-col items-center justify-center min-h-[48px]">
          {loadingMore && (
            <div className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-400 bg-slate-900/90 border border-slate-800 rounded-full shadow-md">
              <span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span>{t('loadingMore')}</span>
            </div>
          )}
          {!hasMore && !loading && filteredNovels.length > 0 && (
            <p className="text-[11px] text-slate-500 font-medium tracking-wide">
              — {t('allNovelsLoaded')} —
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
