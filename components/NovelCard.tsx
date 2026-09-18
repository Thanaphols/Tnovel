'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, User, Trash2, Eye, Heart, Loader2, Bookmark } from 'lucide-react';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import { useSocket } from '@/lib/socket';
import { toggleBookshelf, isNovelInGuestBookshelf } from '@/lib/bookshelf';
import { useLanguage } from '@/lib/languageContext';
import { useAuth } from '@/lib/authContext';
import { deobfuscateThaiText } from '@/lib/thaiUtils';
import { getCategoryLabel, getCategoryBadgeClass } from '@/lib/categories';

interface NovelCardProps {
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
  onDelete?: (id: string) => void;
}

export default function NovelCard({
  id,
  titleEn,
  titleTh,
  coverUrl,
  category,
  author,
  createdBy,
  chapterCount,
  totalChapters,
  translationStatus,
  chapters = [],
  viewCount = 0,
  likeCount = 0,
  liked = false,
  progress = 0,
  onDelete,
}: NovelCardProps) {
  const router = useRouter();
  const { socket } = useSocket();
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isLiked, setIsLiked] = useState(liked);
  const [currentLikes, setCurrentLikes] = useState(likeCount);
  const [isLiking, setIsLiking] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);

  useEffect(() => {
    if (isNovelInGuestBookshelf(id)) {
      setIsBookmarked(true);
    }
  }, [id]);

  async function handleToggleBookshelf(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isBookmarking) return;

    setIsBookmarking(true);
    const prev = isBookmarked;
    setIsBookmarked(!prev);

    try {
      const res = await toggleBookshelf({
        id,
        titleEn,
        titleTh,
        coverUrl,
        author,
        totalChapters: liveTotalChapters,
      });
      setIsBookmarked(res.inBookshelf);
    } catch {
      setIsBookmarked(prev);
    } finally {
      setIsBookmarking(false);
    }
  }

  const [liveChapterCount, setLiveChapterCount] = useState(chapterCount);
  const [liveTotalChapters, setLiveTotalChapters] = useState(totalChapters || 0);
  const [liveChapters, setLiveChapters] = useState(chapters);

  useEffect(() => {
    setLiveChapterCount(chapterCount);
    setLiveTotalChapters(totalChapters || 0);
    setLiveChapters(chapters);
  }, [chapterCount, totalChapters, chapters]);

  // Real-time socket listener directly in NovelCard
  useEffect(() => {
    if (!socket) return;

    function handleProgress(data: any) {
      if (data?.novelId === id) {
        // chapterCount is how many chapters are actually saved; currentChapter is only the
        // loop position, and reacting to both is what made the card drift ahead of reality.
        if (typeof data.chapterCount === 'number') {
          setLiveChapterCount(data.chapterCount);
        }
        if (data.totalChapters) {
          setLiveTotalChapters(data.totalChapters);
        }
      }
    }

    function handleChapter(data: any) {
      if (data?.novelId === id) {
        setLiveChapterCount((prev) =>
          typeof data.chapterCount === 'number' ? data.chapterCount : prev + 1
        );
        if (data.chapterId) {
          setLiveChapters((prev) => {
            if (prev.some((c) => c.id === data.chapterId)) return prev;
            return [
              ...prev,
              {
                id: data.chapterId,
                chapterNumber: data.chapterNumber || prev.length + 1,
                titleTh: data.chapterTitle || '',
              },
            ];
          });
        }
      }
    }

    socket.on('translation:progress', handleProgress);
    socket.on('chapter:created', handleChapter);

    return () => {
      socket.off('translation:progress', handleProgress);
      socket.off('chapter:created', handleChapter);
    };
  }, [socket, id]);

  useEffect(() => {
    setIsLiked(liked);
    setCurrentLikes(likeCount);

    if (!liked && typeof window !== 'undefined') {
      try {
        const localLikes = JSON.parse(localStorage.getItem('tnovel_guest_likes') || '[]');
        if (localLikes.includes(id)) {
          setIsLiked(true);
        }
      } catch {}
    }
  }, [liked, likeCount, id]);

  const targetUrl = `/novels/${id}`;

  function handleCardClick(e: React.MouseEvent) {
    router.push(targetUrl);
  }

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isLiking) return;

    setIsLiking(true);
    const prevLiked = isLiked;
    const prevCount = currentLikes;

    // Optimistic UI update
    const nextLiked = !prevLiked;
    setIsLiked(nextLiked);
    setCurrentLikes((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      const res = await fetch(`/api/novels/${id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentLiked: prevLiked }),
      });
      const data = await res.json();
      if (data.success) {
        setIsLiked(data.liked);
        setCurrentLikes(data.likeCount);

        // Update guest likes in localStorage
        try {
          let localLikes = JSON.parse(localStorage.getItem('tnovel_guest_likes') || '[]');
          if (data.liked) {
            if (!localLikes.includes(id)) localLikes.push(id);
          } else {
            localLikes = localLikes.filter((item: string) => item !== id);
          }
          localStorage.setItem('tnovel_guest_likes', JSON.stringify(localLikes));
        } catch {}
      } else {
        setIsLiked(prevLiked);
        setCurrentLikes(prevCount);
      }
    } catch (err) {
      console.error(err);
      setIsLiked(prevLiked);
      setCurrentLikes(prevCount);
    } finally {
      setIsLiking(false);
    }
  }

  async function handleSoftDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/novels/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success && onDelete) {
        onDelete(id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className="group relative flex flex-col bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 active:scale-[0.99] cursor-pointer"
      >
        {/* Full card background link for keyboard/screen-readers without nesting buttons */}
        <Link
          href={targetUrl}
          className="absolute inset-0 z-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden="true"
        />

        {/* Cover Aspect Ratio Container */}
        <div className="novel-cover-box relative aspect-[3/4] w-full bg-slate-950 overflow-hidden">
          {coverUrl && !imgError ? (
            <img
              src={coverUrl}
              alt={titleTh || titleEn}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="novel-placeholder w-full h-full flex flex-col items-center justify-center p-2 bg-slate-950 text-center">
              <BookOpen className="w-6 h-6 text-amber-500/60 mb-1 group-hover:scale-110 transition-transform" />
              <p className="text-[10px] font-bold text-amber-200/90 line-clamp-2 px-1">
                {titleTh || titleEn}
              </p>
            </div>
          )}

          {/* Badge for translation status / chapters */}
          {liveChapterCount === 0 ? (
            <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[8.5px] font-bold bg-amber-500 text-slate-950 rounded backdrop-blur-md shadow-md flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-ping" />
              <span>{t('translating')}</span>
            </div>
          ) : liveTotalChapters && liveChapterCount < liveTotalChapters ? (
            <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[8.5px] font-bold bg-amber-500/90 text-slate-950 rounded backdrop-blur-md shadow-md flex items-center gap-1">
              <span>{liveChapterCount}/{liveTotalChapters} {t('chaptersCount')}</span>
            </div>
          ) : null}

          {/* Delete Button (Soft Delete - Admin only) */}
          {isAdmin && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowConfirmDelete(true);
              }}
              className="novel-delete-btn absolute top-1 right-1 p-1 text-slate-400 hover:text-rose-400 bg-slate-950/80 hover:bg-rose-500/20 backdrop-blur-md border border-slate-800 hover:border-rose-500/40 rounded transition-all z-10"
              title={t('moveToBin')}
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          )}

          {/* Category Badge on Cover Overlay */}
          {category && (
            <div
              className={`absolute bottom-1.5 left-1 z-10 px-1.5 py-0.5 text-[8px] font-bold rounded backdrop-blur-md border shadow-sm ${getCategoryBadgeClass(category)}`}
              title={`${t('categoryLabel')}: ${getCategoryLabel(category, lang)}`}
            >
              {getCategoryLabel(category, lang)}
            </div>
          )}

          {/* Reading Progress Indicator Overlay */}
          {progress > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-slate-950">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Content Info */}
        <div className="flex-1 flex flex-col p-2 space-y-1">
          <h4
            className="text-[11px] sm:text-xs font-bold text-slate-100 line-clamp-1 leading-snug group-hover:text-ocean-600 dark:group-hover:text-ocean-400 transition-colors"
            title={deobfuscateThaiText(titleTh || titleEn)}
          >
            {deobfuscateThaiText(titleTh || titleEn)}
          </h4>

          {/* Author & Added By Compact Line */}
          <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[9.5px] text-slate-400 leading-tight">
            {author ? (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="inline-flex items-center gap-0.5 text-slate-400 hover:text-ocean-600 dark:hover:text-ocean-400 transition-colors truncate max-w-[60%]"
                title={`${t('authorTitle')}${author.name}`}
              >
                <User className="w-2.5 h-2.5 flex-shrink-0 text-slate-500" />
                <span className="truncate">{deobfuscateThaiText(author.name)}</span>
              </div>
            ) : <span />}

            <div
              className="flex items-center gap-0.5 text-slate-500 truncate max-w-[40%] justify-end"
              title={`${t('addedByTitle')}${createdBy?.name || createdBy?.email || t('guest')}`}
            >
              <span className="text-amber-400/90 font-medium truncate">
                {createdBy?.name || (createdBy?.email ? createdBy.email.split('@')[0] : t('guest'))}
              </span>
            </div>
          </div>

          {/* Bottom Stats & Like Row */}
          <div className="mt-auto pt-1 border-t border-slate-800/60 flex items-center justify-between gap-1 text-[9px] sm:text-[9.5px]">
            {/* Left: Views + Chapters */}
            <div className="flex items-center gap-1.5 text-slate-400">
              {/* Views (Eye icon) */}
              <div className="flex items-center gap-0.5" title={`${t('viewCountTitle')}${viewCount}${t('timesUnit')}`}>
                <Eye className="w-2.5 h-2.5 text-slate-400" />
                <span className="font-semibold text-slate-300">{viewCount}</span>
              </div>

              {/* Chapters count (Book icon) */}
              <div className="flex items-center gap-0.5" title={`${liveChapterCount}${liveTotalChapters ? `${t('fromTotal')}${liveTotalChapters}` : ''} ${t('chaptersCount')}`}>
                <BookOpen className="w-2.5 h-2.5 text-amber-400/90" />
                <span className="font-semibold text-amber-400/90 font-mono">
                  {liveChapterCount}{liveTotalChapters && liveTotalChapters > 0 ? `/${liveTotalChapters}` : ''}
                </span>
              </div>
            </div>

            {/* Right: Bookshelf & Like Buttons */}
            <div className="flex items-center gap-0.5 relative z-10">
              {/* Bookshelf / Follow Button */}
              <button
                type="button"
                onClick={handleToggleBookshelf}
                disabled={isBookmarking}
                className={`flex items-center p-0.5 rounded transition-all ${
                  isBookmarked
                    ? 'text-amber-400 hover:text-amber-500'
                    : 'text-slate-400 hover:text-amber-400'
                }`}
                title={isBookmarked ? t('inBookshelfTooltip') : t('addToBookshelfTooltip')}
              >
                <Bookmark
                  className={`w-2.5 h-2.5 transition-transform active:scale-125 ${
                    isBookmarked ? 'fill-amber-400 text-amber-400' : 'text-slate-400 hover:text-amber-400'
                  }`}
                />
              </button>

              {/* Like Button (Heart icon) */}
              <button
                type="button"
                onClick={handleLike}
                disabled={isLiking}
                className={`flex items-center gap-0.5 p-0.5 rounded transition-all ${
                  isLiked
                    ? 'text-rose-500 hover:text-rose-600'
                    : 'text-slate-400 hover:text-rose-400'
                }`}
                title={isLiked ? t('likedTooltip') : t('likeTooltip')}
              >
                <Heart
                  className={`w-2.5 h-2.5 transition-transform active:scale-125 ${
                    isLiked ? 'fill-rose-500 text-rose-500' : 'text-slate-400 hover:text-rose-400'
                  }`}
                />
                <span className={`font-semibold text-[9px] sm:text-[9.5px] ${isLiked ? 'text-rose-500' : 'text-slate-400'}`}>
                  {currentLikes}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isAdmin && (
        <ConfirmDeleteModal
          isOpen={showConfirmDelete}
          title={`${t('confirmMoveToBinTitle')} "${titleTh || titleEn}"`}
          message={t('confirmMoveToBinMsg')}
          isLoading={isDeleting}
          onConfirm={handleSoftDelete}
          onClose={() => setShowConfirmDelete(false)}
        />
      )}
    </>
  );
}
