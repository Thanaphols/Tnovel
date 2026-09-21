'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  BookOpen,
  Heart,
  Bookmark,
  Eye,
  ArrowLeft,
  Share2,
  ExternalLink,
  Calendar,
  User,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Trash2,
  CheckCircle2,
  Sparkles,
  RotateCcw,
  BookMarked,
  Languages,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useAuth } from '@/lib/authContext';
import { useSocket } from '@/lib/socket';
import { toggleBookshelf, isNovelInGuestBookshelf, fetchReadingHistory } from '@/lib/bookshelf';
import { deobfuscateThaiText } from '@/lib/thaiUtils';
import { getCategoryLabel, getCategoryBadgeClass } from '@/lib/categories';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import GlossaryEditor from '@/components/GlossaryEditor';
import TranslationPanel from '@/components/TranslationPanel';

interface ChapterItem {
  id: string;
  chapterNumber: number;
  titleEn: string;
  titleTh: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

interface NovelDetail {
  id: string;
  titleEn: string;
  titleTh: string;
  description?: string | null;
  coverUrl?: string | null;
  sourceUrl?: string | null;
  category?: string | null;
  totalChapters: number;
  translationStatus: string;
  viewCount: number;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; name: string } | null;
  createdBy?: { id: string; name?: string | null; email?: string | null; avatar?: string | null } | null;
  chapters: ChapterItem[];
  isLiked?: boolean;
  inBookshelf?: boolean;
  readingProgress?: {
    chapterId: string;
    chapterNumber: number;
    scrollPercent: number;
  } | null;
}

export default function NovelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const { socket } = useSocket();

  const [novel, setNovel] = useState<NovelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Likes & Bookshelf State
  const [isLiked, setIsLiked] = useState(false);
  const [currentLikes, setCurrentLikes] = useState(0);
  const [isLiking, setIsLiking] = useState(false);

  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);

  // Reading progress (from server or guest localStorage)
  const [lastReadChapter, setLastReadChapter] = useState<{
    chapterId: string;
    chapterNumber: number;
  } | null>(null);

  // Synopsis expansion
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);

  // Table of Contents & Translation controls
  const [activeTab, setActiveTab] = useState<'chapters' | 'glossary' | 'translation'>('chapters');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // UI helpers
  const [imgError, setImgError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch Novel Details
  useEffect(() => {
    if (!id) return;
    loadNovel();
  }, [id]);

  // silent: refresh novel data (chapter statuses for the overview) without the full-page
  // loading/error takeover — used mid-batch so the running panel never unmounts.
  async function loadNovel(opts?: { silent?: boolean }) {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/novels/${id}`);
      const data = await res.json();

      if (data.success && data.novel) {
        const fetchedNovel: NovelDetail = data.novel;
        setNovel(fetchedNovel);
        setIsLiked(!!fetchedNovel.isLiked);
        setCurrentLikes(fetchedNovel.likeCount || 0);
        setIsBookmarked(!!fetchedNovel.inBookshelf);

        // Check local guest like status if not logged in
        if (!fetchedNovel.isLiked && typeof window !== 'undefined') {
          try {
            const guestLikes: string[] = JSON.parse(localStorage.getItem('tnovel_guest_likes') || '[]');
            if (guestLikes.includes(id)) {
              setIsLiked(true);
            }
          } catch {}
        }

        // Check local guest bookshelf status if not in DB
        if (!fetchedNovel.inBookshelf && isNovelInGuestBookshelf(id)) {
          setIsBookmarked(true);
        }

        // Set reading progress
        if (fetchedNovel.readingProgress) {
          setLastReadChapter({
            chapterId: fetchedNovel.readingProgress.chapterId,
            chapterNumber: fetchedNovel.readingProgress.chapterNumber,
          });
        } else {
          // Check guest reading history
          fetchReadingHistory().then(({ history }) => {
            const hist = history.find((h) => h.novelId === id);
            if (hist && hist.lastChapterId) {
              setLastReadChapter({
                chapterId: hist.lastChapterId,
                chapterNumber: hist.lastChapterNumber,
              });
            }
          });
        }
      } else {
        throw new Error(data.error || 'ไม่พบนิยายเรื่องนี้');
      }
    } catch (err: any) {
      console.error('Failed to load novel:', err);
      // A transient mid-batch refetch failure must not tear the page down to the error screen.
      if (!opts?.silent) setError(err.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลนิยาย');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  // Real-time Socket.io updates for background translation progress / chapter creation
  useEffect(() => {
    if (!socket || !id) return;

    function handleChapterCreated(data: any) {
      if (data?.novelId === id) {
        setNovel((prev) => {
          if (!prev) return prev;
          const chapters = prev.chapters ? [...prev.chapters] : [];
          if (data.chapterId && !chapters.some((c) => c.id === data.chapterId)) {
            chapters.push({
              id: data.chapterId,
              chapterNumber: data.chapterNumber || chapters.length + 1,
              titleEn: data.chapterTitleEn || '',
              titleTh: data.chapterTitle || `${t('chapterPrefix')} ${chapters.length + 1}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
          }
          return {
            ...prev,
            chapters,
            totalChapters: data.totalChapters || prev.totalChapters,
          };
        });
      }
    }

    function handleProgress(data: any) {
      if (data?.novelId === id) {
        setNovel((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            totalChapters: data.totalChapters || prev.totalChapters,
            translationStatus: data.isFinished ? 'COMPLETED' : prev.translationStatus,
          };
        });
      }
    }

    socket.on('chapter:created', handleChapterCreated);
    socket.on('translation:progress', handleProgress);

    return () => {
      socket.off('chapter:created', handleChapterCreated);
      socket.off('translation:progress', handleProgress);
    };
  }, [socket, id, t]);

  // Handle Like Toggle
  async function handleLike() {
    if (isLiking || !novel) return;
    setIsLiking(true);

    const prevLiked = isLiked;
    const prevCount = currentLikes;
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
    } catch {
      setIsLiked(prevLiked);
      setCurrentLikes(prevCount);
    } finally {
      setIsLiking(false);
    }
  }

  // Handle Bookshelf Toggle
  async function handleToggleBookshelf() {
    if (isBookmarking || !novel) return;
    setIsBookmarking(true);

    const prev = isBookmarked;
    setIsBookmarked(!prev);

    try {
      const res = await toggleBookshelf({
        id: novel.id,
        titleEn: novel.titleEn,
        titleTh: novel.titleTh,
        coverUrl: novel.coverUrl,
        author: novel.author,
        totalChapters: novel.chapters?.length || novel.totalChapters || 0,
      });
      setIsBookmarked(res.inBookshelf);
      showToast(res.message);
    } catch {
      setIsBookmarked(prev);
    } finally {
      setIsBookmarking(false);
    }
  }

  // Handle Share link
  async function handleShare() {
    if (!novel) return;
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    const shareTitle = novel.titleTh || novel.titleEn;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `อ่านนิยายเรื่อง ${shareTitle} แปลไทยที่ Tnovel`,
          url: shareUrl,
        });
        return;
      } catch {}
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast(t('copiedLinkToast'));
    } catch {
      showToast('URL: ' + shareUrl);
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  // Soft delete for admin
  async function handleSoftDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/novels/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        router.push('/');
      } else {
        showToast(data.error || 'เกิดข้อผิดพลาดในการย้ายลงถังขยะ');
      }
    } catch {
      showToast('เกิดข้อผิดพลาดในการย้ายลงถังขยะ');
    } finally {
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  }

  // Filtered & Sorted Chapter List
  const filteredChapters = useMemo(() => {
    if (!novel?.chapters) return [];
    let list = [...novel.chapters];

    const rawQuery = searchQuery.trim();
    if (rawQuery) {
      list = list.filter((chap) => {
        const titleTh = chap.titleTh || `${t('chapterPrefix')} ${chap.chapterNumber}`;
        const titleEn = chap.titleEn || '';

        // 1. Explicit chapter number prefix: #25
        if (rawQuery.startsWith('#')) {
          const numStr = rawQuery.replace('#', '').trim();
          if (/^\d+$/.test(numStr)) {
            return chap.chapterNumber === parseInt(numStr, 10);
          }
        }

        // 2. Exact pure number search (e.g. "25"):
        // Checks standalone number in title (matches "บทที่ 25", "ตอนที่ 25", "Chapter 25", "25.")
        // Does NOT match "125", "250", etc. (no LIKE '%25%')
        if (/^\d+$/.test(rawQuery)) {
          const regex = new RegExp(`(?<!\\d)${rawQuery}(?!\\d)`);
          return regex.test(titleTh) || regex.test(titleEn);
        }

        // 3. Query ending with a number (e.g. "บทที่ 2", "ตอนที่ 25", "Chapter 125"):
        // Prevents "บทที่ 2" from matching "บทที่ 24", "บทที่ 25", "บทที่ 20"
        const endNumMatch = rawQuery.match(/^(.*?)(\d+)$/);
        if (endNumMatch) {
          const escapedPrefix = endNumMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const num = endNumMatch[2];
          const regex = new RegExp(`(?<!\\d)${escapedPrefix}${num}(?!\\d)`, 'i');
          return regex.test(titleTh) || regex.test(titleEn);
        }

        // 4. General text search in chapter title
        const lowerQuery = rawQuery.toLowerCase();
        return (
          titleTh.toLowerCase().includes(lowerQuery) ||
          titleEn.toLowerCase().includes(lowerQuery)
        );
      });
    }

    if (sortOrder === 'desc') {
      list.sort((a, b) => b.chapterNumber - a.chapterNumber);
    } else {
      list.sort((a, b) => a.chapterNumber - b.chapterNumber);
    }

    return list;
  }, [novel?.chapters, searchQuery, sortOrder, t]);

  const firstChapter = useMemo(() => {
    if (!novel?.chapters || novel.chapters.length === 0) return null;
    return [...novel.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)[0];
  }, [novel?.chapters]);

  // Loading State
  if (loading) {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
        <p className="text-sm font-medium text-slate-400 animate-pulse">{t('loadingNovels')}</p>
      </div>
    );
  }

  // Error State
  if (error || !novel) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-slate-100">{t('loadingNovelsSub')}</h2>
        <p className="text-xs text-slate-400 leading-relaxed">{error || t('noNovels')}</p>
        <div className="flex items-center gap-3 pt-2">
          <Link
            href="/"
            className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
          >
            {t('backToHome')}
          </Link>
          <button
            onClick={loadNovel}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all"
          >
            {t('tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  const rawDescription = novel.description?.trim() || '';
  const isLongDescription = rawDescription.length > 320;
  const displayDescription =
    isLongDescription && !isSynopsisExpanded
      ? `${rawDescription.slice(0, 320)}...`
      : rawDescription;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-slate-900/95 border border-amber-500/40 text-amber-300 text-xs font-medium rounded-full shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Breadcrumbs & Action Bar */}
      <div className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 truncate">
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                } else {
                  router.push('/');
                }
              }}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-900 rounded-xl transition-all flex-shrink-0"
              title={t('back')}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400 truncate">
              <Link href="/" className="hover:text-amber-400 transition-colors flex-shrink-0">
                {t('home')}
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-200 truncate font-medium">
                {deobfuscateThaiText(novel.titleTh || novel.titleEn)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {novel.sourceUrl && (
              <a
                href={novel.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all"
                title={t('viewOriginalSource')}
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">{t('sourceOriginal')}</span>
              </a>
            )}

            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all"
              title={t('shareNovel')}
            >
              <Share2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">{t('shareNovel')}</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-xl transition-all"
                title={t('moveToBin')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-8">
        {/* Novel Hero Section */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 sm:p-7 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
            {/* Left: Novel Cover */}
            <div className="w-full md:w-56 lg:w-64 flex-shrink-0 mx-auto md:mx-0 max-w-[240px] md:max-w-none">
              <div className="relative aspect-[3/4] w-full bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 group">
                {novel.coverUrl && !imgError ? (
                  <img
                    src={novel.coverUrl}
                    alt={novel.titleTh || novel.titleEn}
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-slate-950 text-center">
                    <BookOpen className="w-12 h-12 text-amber-500/50 mb-3" />
                    <p className="text-xs font-bold text-amber-200/90 line-clamp-3">
                      {novel.titleTh || novel.titleEn}
                    </p>
                  </div>
                )}

                {/* Badges on Cover */}
                <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 z-10">
                  {novel.chapters?.length === 0 || novel.translationStatus === 'TRANSLATING' ? (
                    <div className="px-2 py-0.5 text-[10px] font-bold bg-amber-500 text-slate-950 rounded-md shadow-md backdrop-blur-md flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-ping" />
                      <span>{t('statusTranslating')}</span>
                    </div>
                  ) : (
                    <div className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/90 text-white rounded-md shadow-md backdrop-blur-md flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{t('statusCompleted')}</span>
                    </div>
                  )}
                </div>

                {novel.category && (
                  <div
                    className={`absolute bottom-2.5 left-2.5 z-10 px-2 py-0.5 text-[10px] font-bold rounded-md backdrop-blur-md border shadow-md ${getCategoryBadgeClass(
                      novel.category
                    )}`}
                  >
                    {getCategoryLabel(novel.category, lang)}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Novel Metadata & Actions */}
            <div className="flex-1 flex flex-col justify-between space-y-5">
              <div className="space-y-3">
                {/* Titles */}
                <div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold font-serif text-slate-100 leading-tight tracking-tight">
                    {deobfuscateThaiText(novel.titleTh || novel.titleEn)}
                  </h1>
                  {novel.titleEn && novel.titleEn !== novel.titleTh && (
                    <p className="text-sm sm:text-base text-slate-400 font-medium italic mt-1 leading-snug">
                      {novel.titleEn}
                    </p>
                  )}
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  {/* Author */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                    <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="truncate">
                      <p className="text-[10px] text-slate-500">{t('author')}</p>
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {deobfuscateThaiText(novel.author?.name || t('unknownAuthor'))}
                      </p>
                    </div>
                  </div>

                  {/* Added By */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                    <Sparkles className="w-4 h-4 text-amber-400/80 flex-shrink-0" />
                    <div className="truncate">
                      <p className="text-[10px] text-slate-500">{t('addedBy')}</p>
                      <p className="text-xs font-semibold text-amber-400/90 truncate">
                        {novel.createdBy?.name ||
                          (novel.createdBy?.email ? novel.createdBy.email.split('@')[0] : t('guest'))}
                      </p>
                    </div>
                  </div>

                  {/* Total Chapters */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                    <BookOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div className="truncate">
                      <p className="text-[10px] text-slate-500">{t('totalChaptersInNovel')}</p>
                      <p className="text-xs font-semibold text-slate-100 font-mono">
                        {novel.chapters?.length || 0}
                        {novel.totalChapters && novel.totalChapters > (novel.chapters?.length || 0)
                          ? ` / ${novel.totalChapters}`
                          : ''}{' '}
                        {t('chaptersInNovelCount')}
                      </p>
                    </div>
                  </div>

                  {/* Views */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                    <Eye className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="truncate">
                      <p className="text-[10px] text-slate-500">{t('viewCountTitle')}</p>
                      <p className="text-xs font-semibold text-slate-200">
                        {novel.viewCount.toLocaleString()} {t('timesUnit')}
                      </p>
                    </div>
                  </div>

                  {/* Likes */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                    <Heart
                      className={`w-4 h-4 flex-shrink-0 ${
                        isLiked ? 'fill-rose-500 text-rose-500' : 'text-slate-400'
                      }`}
                    />
                    <div className="truncate">
                      <p className="text-[10px] text-slate-500">{t('likeTooltip')}</p>
                      <p className={`text-xs font-semibold ${isLiked ? 'text-rose-400' : 'text-slate-200'}`}>
                        {currentLikes.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Created Date */}
                  <div className="flex items-center gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="truncate">
                      <p className="text-[10px] text-slate-500">{t('publishedDate')}</p>
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {new Date(novel.createdAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons Toolbar */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                {/* 1. Continue Reading / Read First Chapter Primary CTA */}
                {lastReadChapter ? (
                  <>
                    <Link
                      href={`/reader/${lastReadChapter.chapterId}?from=novel`}
                      onClick={() => {
                        try {
                          sessionStorage.setItem('tnovel_reader_return_url', `/novels/${id}`);
                        } catch {}
                      }}
                      className="inline-flex items-center gap-2 px-5 py-3 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-98 rounded-2xl shadow-lg shadow-amber-500/20 transition-all"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>
                        {t('continueReadingChapter')} {t('chapterPrefix')} {lastReadChapter.chapterNumber}
                      </span>
                    </Link>

                    {firstChapter && firstChapter.id !== lastReadChapter.chapterId && (
                      <Link
                        href={`/reader/${firstChapter.id}?from=novel`}
                        onClick={() => {
                          try {
                            sessionStorage.setItem('tnovel_reader_return_url', `/novels/${id}`);
                          } catch {}
                        }}
                        className="inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-2xl transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t('readFirstChapter')}</span>
                      </Link>
                    )}
                  </>
                ) : firstChapter ? (
                  <Link
                    href={`/reader/${firstChapter.id}?from=novel`}
                    onClick={() => {
                      try {
                        sessionStorage.setItem('tnovel_reader_return_url', `/novels/${id}`);
                      } catch {}
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-98 rounded-2xl shadow-lg shadow-amber-500/20 transition-all"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>{t('startReadingFirstChapter')}</span>
                  </Link>
                ) : (
                  <div className="inline-flex items-center gap-2 px-5 py-3 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>{t('translating')}</span>
                  </div>
                )}

                {/* 2. Bookshelf Toggle Button */}
                <button
                  type="button"
                  onClick={handleToggleBookshelf}
                  disabled={isBookmarking}
                  className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-2xl border transition-all ${
                    isBookmarked
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-slate-900 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                  }`}
                  title={isBookmarked ? t('inBookshelfTooltip') : t('addToBookshelfTooltip')}
                >
                  <Bookmark
                    className={`w-4 h-4 transition-transform active:scale-125 ${
                      isBookmarked ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                    }`}
                  />
                  <span>{isBookmarked ? t('inBookshelfTooltip') : t('addToBookshelfTooltip')}</span>
                </button>

                {/* 3. Like Button */}
                <button
                  type="button"
                  onClick={handleLike}
                  disabled={isLiking}
                  className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-2xl border transition-all ${
                    isLiked
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                      : 'bg-slate-900 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                  }`}
                  title={isLiked ? t('likedTooltip') : t('likeTooltip')}
                >
                  <Heart
                    className={`w-4 h-4 transition-transform active:scale-125 ${
                      isLiked ? 'fill-rose-500 text-rose-500' : 'text-slate-400'
                    }`}
                  />
                  <span>{currentLikes > 0 ? currentLikes : t('likeTooltip')}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Synopsis Section */}
        <section className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-5 sm:p-7 space-y-3">
          <div className="flex items-center gap-2 text-slate-200">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="text-base sm:text-lg font-bold">{t('novelSynopsis')}</h2>
          </div>

          {rawDescription ? (
            <div className="space-y-2">
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {deobfuscateThaiText(displayDescription)}
              </p>

              {isLongDescription && (
                <button
                  onClick={() => setIsSynopsisExpanded(!isSynopsisExpanded)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors pt-1"
                >
                  <span>{isSynopsisExpanded ? t('readLessSynopsis') : t('readMoreSynopsis')}</span>
                  {isSynopsisExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">{t('noSynopsis')}</p>
          )}
        </section>

        {/* Navigation Tabs: Chapters vs Glossary */}
        <div className="flex items-center gap-4 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={`flex items-center gap-2 pb-3 px-1 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'chapters'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>{t('tableOfContentsForNovel')}</span>
            <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-slate-800 text-amber-400 rounded-full border border-slate-700/60">
              {novel.chapters?.length || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('glossary')}
            className={`flex items-center gap-2 pb-3 px-1 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'glossary'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookMarked className="w-4 h-4" />
            <span>คำศัพท์เฉพาะเรื่อง (Glossary)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('translation')}
            className={`flex items-center gap-2 pb-3 px-1 text-sm font-bold border-b-2 transition-all ${
              activeTab === 'translation'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Languages className="w-4 h-4" />
            <span>การแปล</span>
          </button>
        </div>

        {activeTab === 'translation' ? (
          <TranslationPanel
            novelId={novel.id}
            novelTitle={novel.titleTh || novel.titleEn}
            chapters={novel.chapters}
            onChaptersUpdated={() => loadNovel({ silent: true })}
          />
        ) : activeTab === 'glossary' ? (
          <section className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-5 sm:p-7">
            <GlossaryEditor novelId={novel.id} novelTitle={novel.titleTh || novel.titleEn} />
          </section>
        ) : (
          /* Chapter Table of Contents Section */
          <section className="space-y-4">
          {/* Section Header & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                {t('tableOfContentsForNovel')}
              </h2>
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-slate-800 text-amber-400/90 rounded-full font-mono border border-slate-700/40">
                {novel.chapters?.length || 0} {t('chaptersInNovelCount')}
              </span>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2">
              {/* Search Chapter */}
              <div className="relative flex-1 sm:w-60">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('filterChaptersPlaceholder')}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 transition-all"
                />
              </div>

              {/* Sort Order Toggle */}
              <button
                type="button"
                onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all"
                title={sortOrder === 'asc' ? t('sortOldestFirst') : t('sortNewestFirst')}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">
                  {sortOrder === 'asc' ? t('sortOldestFirst') : t('sortNewestFirst')}
                </span>
              </button>
            </div>
          </div>

          {/* Chapter Grid / List */}
          {filteredChapters.length === 0 ? (
            <div className="py-16 text-center space-y-2 bg-slate-900/30 rounded-3xl border border-slate-800/40">
              <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">
                {searchQuery ? t('noChaptersFoundFilter') : t('noChaptersInSystem')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredChapters.map((chap) => {
                const isLastRead = lastReadChapter?.chapterId === chap.id;

                return (
                  <Link
                    key={chap.id}
                    href={`/reader/${chap.id}?from=novel`}
                    onClick={() => {
                      try {
                        sessionStorage.setItem('tnovel_reader_return_url', `/novels/${id}`);
                      } catch {}
                    }}
                    className={`group flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all duration-200 ${
                      isLastRead
                        ? 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/15'
                        : 'bg-slate-900/50 hover:bg-slate-900 border-slate-850 hover:border-amber-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate min-w-0">
                      {/* Chapter Number Badge */}
                      <span
                        className={`text-xs font-bold font-mono px-2 py-1 rounded-lg flex-shrink-0 ${
                          isLastRead
                            ? 'bg-amber-400 text-slate-950 shadow-sm'
                            : 'bg-slate-800 text-slate-300 group-hover:bg-amber-500/20 group-hover:text-amber-300 transition-colors'
                        }`}
                      >
                        #{chap.chapterNumber}
                      </span>

                      {/* Chapter Title */}
                      <div className="truncate">
                        <p
                          className={`text-xs sm:text-sm font-medium truncate ${
                            isLastRead
                              ? 'text-amber-200 font-bold'
                              : 'text-slate-200 group-hover:text-amber-300 transition-colors'
                          }`}
                        >
                          {deobfuscateThaiText(
                            chap.titleTh || `${t('chapterPrefix')} ${chap.chapterNumber}`
                          )}
                        </p>
                        {chap.titleEn && chap.titleEn !== chap.titleTh && (
                          <p className="text-[10px] text-slate-500 truncate group-hover:text-slate-400 transition-colors">
                            {chap.titleEn}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right side: Last read badge or date */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isLastRead ? (
                        <span className="px-2 py-0.5 text-[9px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 rounded-md">
                          {t('lastReadBadge')}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">
                          {new Date(chap.createdAt).toLocaleDateString(
                            lang === 'th' ? 'th-TH' : 'en-US',
                            {
                              day: 'numeric',
                              month: 'short',
                            }
                          )}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
      </main>

      {/* Admin Confirm Delete Modal */}
      {isAdmin && (
        <ConfirmDeleteModal
          isOpen={showConfirmDelete}
          title={`${t('confirmMoveToBinTitle')} "${novel.titleTh || novel.titleEn}"`}
          message={t('confirmMoveToBinMsg')}
          isLoading={isDeleting}
          onConfirm={handleSoftDelete}
          onClose={() => setShowConfirmDelete(false)}
        />
      )}
    </div>
  );
}
