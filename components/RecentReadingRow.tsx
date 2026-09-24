'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { History, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { fetchReadingHistory, getCachedReadingHistory, ReadingHistoryItem } from '@/lib/bookshelf';
import { useLanguage } from '@/lib/languageContext';
import RecentReadingPlaceholder from './RecentReadingPlaceholder';

export default function RecentReadingRow() {
  const [history, setHistory] = useState<ReadingHistoryItem[]>(() => {
    return getCachedReadingHistory();
  });
  const [loading, setLoading] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t, lang } = useLanguage();

  const loadHistory = async () => {
    try {
      const res = await fetchReadingHistory();
      if (res.history) {
        setHistory(res.history);
      }
    } catch {
      // keep cached history
    }
  };

  useEffect(() => {
    loadHistory();

    const handleUpdate = () => {
      loadHistory();
    };

    window.addEventListener('tnovel:bookshelf-updated', handleUpdate);
    window.addEventListener('focus', handleUpdate);
    return () => {
      window.removeEventListener('tnovel:bookshelf-updated', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
    };
  }, []);

  const updateScrollState = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const hasOverflow = scrollWidth > clientWidth + 4;
    setIsOverflowing(hasOverflow);
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const timer = setTimeout(updateScrollState, 100);

    const el = scrollRef.current;
    if (!el) return () => clearTimeout(timer);

    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateScrollState();
      });
      ro.observe(el);
    }

    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      if (ro) ro.disconnect();
    };
  }, [history]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 280;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return t('timeJustNow');
      if (diffMins < 60) return `${diffMins} ${t('timeMinsAgo')}`;
      if (diffHours < 24) return `${diffHours} ${t('timeHoursAgo')}`;
      if (diffDays < 7) return `${diffDays} ${t('timeDaysAgo')}`;
      return date.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  if (history.length === 0) {
    return <RecentReadingPlaceholder />;
  }

  return (
    <div className="space-y-3 pt-2">
      {/* Header with Title and Count */}
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
          <History className="w-5 h-5 text-amber-400" />
          <span>{t('recentReadingTitle')}</span>
          <span className="text-xs font-semibold text-slate-400">({history.length})</span>
        </h2>
      </div>

      {/* Card Row Container with Overlay Floating Buttons */}
      <div className="relative group/scroll">
        {/* Left Scroll Overlay Button (Only shown when overflowing and can scroll left) */}
        {isOverflowing && canScrollLeft && (
          <button
            type="button"
            onClick={() => handleScroll('left')}
            className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-900/90 border border-slate-700 text-slate-200 shadow-xl backdrop-blur-sm flex items-center justify-center hover:bg-slate-800 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
            aria-label={t('scrollLeft')}
            title={t('scrollLeft')}
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}

        {/* Horizontal Scrollable Row */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scroll-smooth pb-2 pt-1 no-scrollbar select-none min-h-[98px] sm:min-h-[114px]"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {history.map((item) => {
            const displayTitle = lang === 'en' ? (item.titleEn || item.novelTitle) : (item.titleTh || item.novelTitle);
            const percent = Math.min(100, Math.max(0, Math.round(item.scrollPercent || 0)));

            return (
              <Link
                key={item.id || item.novelId}
                href={`/reader/${item.lastChapterId}?from=home${percent > 0 ? `&p=${percent}` : ''}`}
                scroll={false}
                onClick={() => {
                  try {
                    sessionStorage.setItem('tnovel_reader_return_url', '/');
                  } catch {}
                }}
                className="group shrink-0 w-56 sm:w-64 md:w-72 p-2.5 bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-xl transition-all flex gap-2.5 hover:-translate-y-0.5 shadow-sm"
              >
                {/* Cover Thumbnail */}
                <div className="relative w-12 h-16 sm:w-14 sm:h-20 rounded-lg overflow-hidden bg-slate-950 shrink-0 border border-slate-800">
                  {item.coverUrl ? (
                    <Image
                      src={item.coverUrl}
                      alt={displayTitle}
                      fill
                      sizes="64px"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <BookOpen className="w-6 h-6" />
                    </div>
                  )}
                </div>

                {/* Info Column */}
                <div className="flex flex-col justify-between min-w-0 flex-1">
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-100 line-clamp-1 group-hover:text-ocean-600 dark:group-hover:text-ocean-400 transition-colors">
                      {displayTitle}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-amber-400 font-medium line-clamp-1 mt-0.5">
                      {t('chapterPrefix')} {item.lastChapterNumber} {item.lastChapterTitle ? `• ${item.lastChapterTitle}` : ''}
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-amber-400 h-full rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {/* Footer Meta */}
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400">
                      <span>{percent}%</span>
                      <span>{formatTimeAgo(item.lastReadAt)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Right Scroll Overlay Button (Only shown when overflowing and can scroll right) */}
        {isOverflowing && canScrollRight && (
          <button
            type="button"
            onClick={() => handleScroll('right')}
            className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-900/90 border border-slate-700 text-slate-200 shadow-xl backdrop-blur-sm flex items-center justify-center hover:bg-slate-800 hover:text-white hover:scale-110 active:scale-95 transition-all cursor-pointer"
            aria-label={t('scrollRight')}
            title={t('scrollRight')}
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
