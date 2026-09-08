'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ReaderView from '@/components/ReaderView';
import { getChapterOffline } from '@/lib/db';
import { Loader2, AlertCircle } from 'lucide-react';

export default function ChapterReaderPage() {
  const params = useParams();
  const id = params?.id as string;

  const [chapter, setChapter] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      if (data.success) {
        setChapter(data.chapter);
        return;
      }
      throw new Error(data.error || 'ไม่สามารถดึงข้อมูลบทนิยายได้');
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
          contentEn: cached.contentEn,
          contentTh: cached.contentTh,
          originalUrl: cached.originalUrl,
          novelId: '',
          novelTitle: cached.novelTitle || 'นิยายในเครื่อง (Offline)',
          authorName: 'Unknown',
        });
      } else {
        setError(err.message || 'ไม่พบบทนิยายและไม่มีข้อมูลแคชแบบ ออฟไลน์');
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
        <p className="text-sm font-medium text-slate-300">กำลังโหลดเนื้อหานิยาย...</p>
      </div>
    );
  }

  if (error || !chapter) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-100">เกิดข้อผิดพลาดในการโหลดบทนิยาย</h2>
        <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
        <button
          onClick={loadChapter}
          className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all"
        >
          ลองใหม่อีกครั้ง
        </button>
      </div>
    );
  }

  return <ReaderView chapter={chapter} />;
}
