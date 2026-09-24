'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import ReaderView from '@/components/ReaderView';
import { getChapterOffline } from '@/lib/db';
import { Loader2, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

function ChapterReaderInner() {
  const { t } = useLanguage();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const pParam = searchParams?.get('p');
  const urlProgress = pParam ? parseInt(pParam, 10) : undefined;

  const [chapter, setChapter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Set manual scroll restoration as early as possible
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    loadChapter();
  }, [id]);

  async function loadChapter() {
    setLoading(true);
    setError(null);

    try {
      // 1. Try online fetch
      const res = await fetch(`/api/chapters/${id}`);
      const data = await res.json();

      if (data.success && data.chapter) {
        const finalPercent =
          typeof urlProgress === 'number' && !isNaN(urlProgress) && urlProgress > 0
            ? urlProgress
            : data.chapter.savedScrollPercent;

        setChapter({
          ...data.chapter,
          savedScrollPercent: finalPercent,
          allChapters: Array.isArray(data.chapter.allChapters) ? data.chapter.allChapters : [],
          contentEn: Array.isArray(data.chapter.contentEn) ? data.chapter.contentEn : [],
          contentTh: Array.isArray(data.chapter.contentTh) ? data.chapter.contentTh : [],
        });
        return;
      }
      throw new Error(data.error || t('loadChapterError'));
    } catch (err: any) {
      console.warn('Network fetch failed, attempting offline cache:', err);
      // 2. Offline fallback from IndexedDB
      const cached = await getChapterOffline(id);
      if (cached) {
        setChapter({
          id: cached.id,
          chapterNumber: cached.chapterNumber || 1,
          titleEn: cached.titleEn,
          titleTh: cached.titleTh,
          contentEn: Array.isArray(cached.contentEn) ? cached.contentEn : [],
          contentTh: Array.isArray(cached.contentTh) ? cached.contentTh : [],
          originalUrl: cached.originalUrl,
          novelId: '',
          novelTitle: cached.novelTitle || t('offline'),
          authorName: 'Unknown',
          allChapters: [],
          savedScrollPercent: urlProgress,
        });
      } else {
        setError(err.message || t('chapterNotFound'));
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">{t('loadingNovelContent')}</p>
      </div>
    );
  }

  if (error || !chapter) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-100">{t('loadChapterError')}</h2>
        <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
        <button
          onClick={loadChapter}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all"
        >
          {t('tryAgain')}
        </button>
      </div>
    );
  }

  return <ReaderView chapter={chapter} />;
}

export default function ChapterReaderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
        </div>
      }
    >
      <ChapterReaderInner />
    </Suspense>
  );
}

