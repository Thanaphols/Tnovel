'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import NovelCard from '@/components/NovelCard';
import NovelCardSkeleton from '@/components/NovelCardSkeleton';
import { User, BookOpen, ArrowLeft, Loader2 } from 'lucide-react';

export default function AuthorDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [author, setAuthor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchAuthor();
  }, [id]);

  async function fetchAuthor() {
    try {
      const res = await fetch(`/api/authors/${id}`);
      const data = await res.json();
      if (data.success) {
        setAuthor(data.author);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 bg-slate-900 rounded-full animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-40 bg-slate-900 rounded-md animate-pulse" />
            <div className="h-3 w-24 bg-slate-900/60 rounded-md animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <NovelCardSkeleton key={idx} />
          ))}
        </div>
      </div>
    );
  }

  if (!author) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <User className="w-12 h-12 text-slate-600" />
        <h2 className="text-lg font-bold text-slate-200">ไม่พบข้อมูลผู้แต่งนี้</h2>
        <Link href="/" className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-xl">
          กลับหน้าหลัก
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors">
        <ArrowLeft className="w-4 h-4" /> กลับคลังนิยาย
      </Link>

      {/* Author Profile Card */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-4">
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl">
          <User className="w-10 h-10" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-slate-100">{author.name}</h1>
          <p className="text-xs text-slate-400">{author.bio || 'ผู้แต่งนิยายภาษาอังกฤษ'}</p>
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
            <BookOpen className="w-3 h-3" /> ผลงานในระบบ: {author.novels?.length || 0} เรื่อง
          </div>
        </div>
      </div>

      {/* Author's Novels Grid */}
      <div className="space-y-4">
        <h2 className="text-base sm:text-lg font-bold text-slate-100">ผลงานนิยายทั้งหมดของผู้แต่ง</h2>
        {author.novels.length === 0 ? (
          <p className="text-xs text-slate-500">ไม่พบนิยายของผู้แต่งรายนี้</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {author.novels.map((novel: any) => (
              <NovelCard
                key={novel.id}
                id={novel.id}
                titleEn={novel.titleEn}
                titleTh={novel.titleTh}
                coverUrl={novel.coverUrl}
                author={{ id: author.id, name: author.name }}
                createdBy={novel.createdBy}
                chapterCount={novel._count?.chapters || 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
