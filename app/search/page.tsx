'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import NovelCardSkeleton from '@/components/NovelCardSkeleton';
import { useLanguage } from '@/lib/languageContext';
import { Search, SlidersHorizontal, Clock, Eye, Layers, Heart, Sparkles, Plus, X, Check, Tag } from 'lucide-react';
import { NOVEL_CATEGORIES, getCategoryLabel } from '@/lib/categories';

const NovelCard = dynamic(() => import('@/components/NovelCard'), {
  ssr: false,
  loading: () => <NovelCardSkeleton />,
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

type SortKey = 'latest' | 'newest' | 'views' | 'chapters' | 'likes';

const PAGE_SIZE = 18;

export default function SearchPage() {
  const { t, lang } = useLanguage();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  // User-built filters (tags). No sort = default 'latest', shown implicitly.
  const [activeSort, setActiveSort] = useState<SortKey | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const [novels, setNovels] = useState<NovelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  // Guards against a stale in-flight response overwriting a newer query's results.
  const reqIdRef = useRef(0);

  const SORT_OPTIONS: { key: SortKey; label: string; icon: React.ElementType }[] = [
    { key: 'latest', label: t('sortLatest'), icon: Clock },
    { key: 'newest', label: t('sortNewest'), icon: Sparkles },
    { key: 'views', label: t('sortMostViewed'), icon: Eye },
    { key: 'chapters', label: t('sortMostChapters'), icon: Layers },
    { key: 'likes', label: t('sortMostLiked'), icon: Heart },
  ];
  const sortMeta = (k: SortKey) => SORT_OPTIONS.find((o) => o.key === k)!;

  // Debounce the text input so we don't hit the API on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  // Close the add-filter popover on outside click.
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen]);

  const buildUrl = useCallback(
    (cursor?: string | null) => {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), sort: activeSort || 'latest' });
      if (debouncedQuery) p.set('search', debouncedQuery);
      if (categories.length) p.set('category', categories.join(','));
      if (cursor) p.set('cursor', cursor);
      return `/api/novels?${p.toString()}`;
    },
    [debouncedQuery, categories, activeSort]
  );

  // Fresh fetch whenever the query or filters change.
  useEffect(() => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    fetch(buildUrl(), { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (myReq !== reqIdRef.current) return;
        setNovels(data.items || []);
        setNextCursor(data.nextCursor || null);
        setHasMore(!!data.nextCursor);
        setTotal(typeof data.total === 'number' ? data.total : null);
      })
      .catch(() => {
        if (myReq !== reqIdRef.current) return;
        setNovels([]);
        setHasMore(false);
        setTotal(0);
      })
      .finally(() => {
        if (myReq === reqIdRef.current) setLoading(false);
      });
  }, [buildUrl]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !nextCursor || loading) return;
    const myReq = reqIdRef.current;
    setLoadingMore(true);
    fetch(buildUrl(nextCursor), { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (myReq !== reqIdRef.current) return;
        setNovels((prev) => {
          const seen = new Set(prev.map((n) => n.id));
          const fresh = (data.items || []).filter((n: NovelItem) => !seen.has(n.id));
          return [...prev, ...fresh];
        });
        setNextCursor(data.nextCursor || null);
        setHasMore(!!data.nextCursor);
      })
      .catch(() => {})
      .finally(() => {
        if (myReq === reqIdRef.current) setLoadingMore(false);
      });
  }, [buildUrl, loadingMore, hasMore, nextCursor, loading]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const handleNovelDelete = (id: string) => {
    setNovels((prev) => prev.filter((n) => n.id !== id));
    setTotal((prev) => (typeof prev === 'number' ? Math.max(0, prev - 1) : prev));
  };

  const toggleCategory = (id: string) =>
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const clearAll = () => {
    setActiveSort(null);
    setCategories([]);
  };

  const hasFilters = activeSort !== null || categories.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">
      {/* Header + search input */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Search className="w-6 h-6 text-amber-400" />
            {t('searchNovels')}
          </h1>
          <p className="text-xs text-slate-400 mt-1">{t('searchPageSub')}</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            autoFocus
            className="w-full h-12 pl-11 pr-4 text-sm bg-slate-900 border border-slate-800 rounded-2xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
          />
        </div>
      </div>

      {/* Filter tags + add-filter popover */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 border-dashed text-slate-300 hover:text-slate-100 hover:border-amber-500/40 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addFilter')}
          </button>

          {filterOpen && (
            <div className="absolute left-0 top-full mt-2 w-60 max-h-[70vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 space-y-3 animate-in fade-in zoom-in-95 duration-150">
              {/* Sort group */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3" /> {t('sortLabel')}
                </p>
                {SORT_OPTIONS.map((opt) => {
                  const active = (activeSort || 'latest') === opt.key;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setActiveSort(opt.key === 'latest' ? null : opt.key)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        active ? 'bg-amber-500/15 text-amber-300' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="flex-1 text-left">{opt.label}</span>
                      {active && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-800" />

              {/* Category group */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> {t('categoryLabel')}
                </p>
                {NOVEL_CATEGORIES.map((cat) => {
                  const active = categories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        active ? 'bg-amber-500/15 text-amber-300' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex-1 text-left">{lang === 'en' ? cat.nameEn : cat.nameTh}</span>
                      {active && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Active sort tag (hidden when default) */}
        {activeSort && (
          <FilterTag
            icon={sortMeta(activeSort).icon}
            label={sortMeta(activeSort).label}
            onRemove={() => setActiveSort(null)}
          />
        )}

        {/* Active category tags */}
        {categories.map((id) => (
          <FilterTag key={id} icon={Tag} label={getCategoryLabel(id, lang)} onRemove={() => toggleCategory(id)} />
        ))}

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="h-8 px-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-400 transition-colors"
          >
            {t('clearFilters')}
          </button>
        )}
      </div>

      {/* Results */}
      <div className="space-y-4">
        {!loading && (
          <p className="text-xs font-semibold text-slate-400">
            {(total ?? novels.length).toLocaleString()} {t('searchResultsCount')}
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-2 min-[440px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-2.5">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <NovelCardSkeleton key={`s-${i}`} />
            ))}
          </div>
        ) : novels.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/40 border border-slate-800/60 rounded-3xl space-y-3">
            <Search className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-base font-semibold text-slate-300">{t('searchNoResults')}</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">{t('searchNoResultsDesc')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 min-[440px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2 sm:gap-2.5">
            {novels.map((novel) => (
              <NovelCard key={novel.id} {...novel} onDelete={handleNovelDelete} />
            ))}
            {loadingMore &&
              Array.from({ length: 6 }).map((_, i) => <NovelCardSkeleton key={`ms-${i}`} />)}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="py-6 flex items-center justify-center min-h-[48px]">
          {loadingMore && (
            <div className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-400 bg-slate-900/90 border border-slate-800 rounded-full shadow-md">
              <span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span>{t('loadingMore')}</span>
            </div>
          )}
          {!hasMore && !loading && novels.length > 0 && (
            <p className="text-[11px] text-slate-500 font-medium tracking-wide">— {t('allNovelsLoaded')} —</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterTag({
  icon: Icon,
  label,
  onRemove,
}: {
  icon: React.ElementType;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
      <Icon className="w-3.5 h-3.5" />
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 p-0.5 rounded-md hover:bg-amber-500/25 transition-colors"
        aria-label="remove filter"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
