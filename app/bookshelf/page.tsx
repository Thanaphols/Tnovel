'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Library,
  BookOpen,
  Clock,
  Bookmark,
  Sparkles,
  Trash2,
  ChevronRight,
  Play,
  RotateCcw,
  CheckCircle2,
  BookMarked,
  ArrowRight,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  fetchBookshelf,
  fetchReadingHistory,
  fetchBookmarks,
  toggleBookshelf,
  clearReadingHistory,
  toggleChapterBookmark,
  BookshelfNovel,
  ReadingHistoryItem,
  ChapterBookmarkItem,
} from '@/lib/bookshelf';
import { useLanguage } from '@/lib/languageContext';

export default function BookshelfPage() {
  const { t, lang } = useLanguage();
  const [activeTab, setActiveTab] = useState<'bookshelf' | 'history' | 'bookmarks'>('bookshelf');

  const [bookshelfList, setBookshelfList] = useState<BookshelfNovel[]>([]);
  const [historyList, setHistoryList] = useState<ReadingHistoryItem[]>([]);
  const [bookmarksList, setBookmarksList] = useState<ChapterBookmarkItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bsRes, histRes, bmRes] = await Promise.all([
        fetchBookshelf(),
        fetchReadingHistory(),
        fetchBookmarks(),
      ]);

      setBookshelfList(bsRes.novels);
      setHistoryList(histRes.history);
      setBookmarksList(bmRes.bookmarks);
      setIsLoggedIn(bsRes.loggedIn || histRes.loggedIn || bmRes.loggedIn);
    } catch (err) {
      console.error('Failed to load bookshelf data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Remove novel from bookshelf
  const handleRemoveFromBookshelf = async (novel: BookshelfNovel) => {
    const res = await toggleBookshelf(novel);
    setBookshelfList((prev) => prev.filter((n) => n.id !== novel.id));
    showToast(res.message);
  };

  // Remove history item
  const handleRemoveHistory = async (novelId: string) => {
    await clearReadingHistory(novelId);
    setHistoryList((prev) => prev.filter((h) => h.novelId !== novelId));
    showToast(t('historyItemRemovedToast'));
  };

  // Clear all history
  const handleClearAllHistory = async () => {
    if (!confirm(t('confirmClearHistoryMsg'))) return;
    await clearReadingHistory();
    setHistoryList([]);
    showToast(t('historyClearedToast'));
  };

  // Remove bookmark
  const handleRemoveBookmark = async (bm: ChapterBookmarkItem) => {
    await toggleChapterBookmark({
      chapterId: bm.chapterId,
      chapterNumber: bm.chapterNumber,
      chapterTitle: bm.chapterTitle,
      novelId: bm.novelId,
      novelTitle: bm.novelTitle,
    });
    setBookmarksList((prev) => prev.filter((b) => b.id !== bm.id && b.chapterId !== bm.chapterId));
    showToast(t('bookmarkRemovedToast'));
  };

  function formatTimeAgo(dateString: string) {
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
  }

  return (
    <div className="min-h-screen pb-24 text-slate-100">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-slate-900 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-2xl shadow-2xl backdrop-blur-md animate-fade-in flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="hero-banner border-b border-slate-800/80 px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="hero-badge p-2.5 rounded-2xl">
                  <Library className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="hero-title text-xl sm:text-2xl font-black">{t('myBookshelf')}</h1>
                  <p className="hero-desc text-xs">
                    {isLoggedIn ? t('bookshelfSyncAccount') : t('bookshelfGuestMode')}
                  </p>
                </div>
              </div>
            </div>

            {/* Tab Buttons */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-2xl self-start sm:self-auto">
              <button
                onClick={() => setActiveTab('bookshelf')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeTab === 'bookshelf'
                    ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookMarked className="w-4 h-4" />
                <span>{t('tabFollowing')}</span>
                {bookshelfList.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      activeTab === 'bookshelf' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {bookshelfList.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeTab === 'history'
                    ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>{t('tabReadingHistory')}</span>
                {historyList.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      activeTab === 'history' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {historyList.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('bookmarks')}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                  activeTab === 'bookmarks'
                    ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bookmark className="w-4 h-4" />
                <span>{t('tabBookmarks')}</span>
                {bookmarksList.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      activeTab === 'bookmarks' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {bookmarksList.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-4 pt-8">
        {loading ? (
          <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            <p className="text-xs text-slate-400 font-medium">{t('bookshelfLoading')}</p>
          </div>
        ) : (
          <>
            {/* ----------------- TAB 1: BOOKSHELF (FOLLOWED) ----------------- */}
            {activeTab === 'bookshelf' && (
              <div>
                {bookshelfList.length === 0 ? (
                  <div className="py-20 text-center space-y-4 max-w-sm mx-auto">
                    <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                      <BookMarked className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-bold text-slate-200">{t('bookshelfEmpty')}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {t('bookshelfEmptyDesc')}
                      </p>
                    </div>
                    <Link
                      href="/"
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-2xl shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                    >
                      <span>{t('btnBrowseNovels')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                    {bookshelfList.map((novel) => {
                      const hasRead = !!novel.lastReadChapter;
                      const nextTargetChapterId = hasRead
                        ? novel.lastReadChapter?.id
                        : novel.firstChapterId;

                      return (
                        <div
                          key={novel.id}
                          className="group relative flex flex-col bg-slate-900/90 hover:bg-slate-900 border border-slate-800/80 hover:border-amber-500/40 rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300"
                        >
                          {/* Unread badge */}
                          {novel.unreadCount > 0 && hasRead && (
                            <div className="absolute top-2.5 left-2.5 z-10 px-2 py-0.5 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full shadow-lg flex items-center gap-1 animate-pulse">
                              <Sparkles className="w-3 h-3" />
                              <span>{t('newChaptersNotice')}{novel.unreadCount} {t('chaptersCount')}</span>
                            </div>
                          )}

                          {/* Cover & Backdrop */}
                          <div className="relative h-36 sm:h-40 w-full bg-slate-950 overflow-hidden">
                            {novel.coverUrl ? (
                              <Image
                                src={novel.coverUrl}
                                alt={novel.titleTh || novel.titleEn}
                                fill
                                sizes="(max-width: 768px) 100vw, 25vw"
                                className="object-cover group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-100"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-700">
                                <BookOpen className="w-10 h-10" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-slate-950/20" />

                            {/* Remove from bookshelf button */}
                            <button
                              onClick={() => handleRemoveFromBookshelf(novel)}
                              className="absolute top-2.5 right-2.5 p-1.5 bg-slate-950/70 hover:bg-rose-500/80 text-slate-300 hover:text-white rounded-lg backdrop-blur-md transition-all opacity-80 hover:opacity-100"
                              title={t('removeFromBookshelfTooltip')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Info Body */}
                          <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between space-y-3">
                            <div className="space-y-1">
                              <h3 className="text-xs sm:text-sm font-bold text-slate-100 line-clamp-1 group-hover:text-ocean-600 dark:group-hover:text-ocean-400 transition-colors">
                                {novel.titleTh || novel.titleEn}
                              </h3>
                              <p className="text-[10.5px] text-slate-400 line-clamp-1">{novel.titleEn}</p>
                              {novel.author?.name && (
                                <p className="text-[10.5px] text-slate-400">{t('authorTitle')}{novel.author.name}</p>
                              )}
                            </div>

                            {/* Reading Status Pill */}
                            <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                              <div className="flex items-center justify-between text-[10.5px]">
                                {hasRead ? (
                                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold truncate">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span className="truncate">
                                      {t('chapterPrefix')} {novel.lastReadChapter?.chapterNumber} ({novel.lastReadChapter?.scrollPercent || 0}%)
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">{t('notStartedReading')}</span>
                                )}
                                <span className="text-slate-400 shrink-0">{t('totalChaptersLabel')}{novel.totalChapters} {t('chaptersCount')}</span>
                              </div>

                              {/* Action: Continue Reading Button */}
                              {nextTargetChapterId ? (
                                <Link
                                  href={`/reader/${nextTargetChapterId}${novel.lastReadChapter?.scrollPercent ? `?p=${novel.lastReadChapter.scrollPercent}` : ''}`}
                                  scroll={false}
                                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3.5 text-xs font-bold rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition-all"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>{hasRead ? t('btnContinueReading') : t('btnStartFirstChapter')}</span>
                                </Link>
                              ) : (
                                <button
                                  disabled
                                  className="w-full py-2 px-3.5 text-xs font-semibold rounded-xl bg-slate-800 text-slate-500 cursor-not-allowed"
                                >
                                  {t('noTranslatedChaptersYet')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ----------------- TAB 2: READING HISTORY ----------------- */}
            {activeTab === 'history' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    {t('historyTabDesc')}
                  </p>
                  {historyList.length > 0 && (
                    <button
                      onClick={handleClearAllHistory}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 rounded-xl transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('btnClearHistory')}</span>
                    </button>
                  )}
                </div>

                {historyList.length === 0 ? (
                  <div className="py-20 text-center space-y-4 max-w-sm mx-auto">
                    <div className="w-16 h-16 rounded-3xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
                      <Clock className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-bold text-slate-200">{t('historyEmptyTitle')}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {t('historyEmptyDesc')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyList.map((item) => (
                      <div
                        key={item.id}
                        className="group p-4 sm:p-5 bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Mini Cover Thumbnail */}
                          <div className="relative w-12 h-16 sm:w-14 sm:h-20 rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-slate-800">
                            {item.coverUrl ? (
                              <Image
                                src={item.coverUrl}
                                alt={item.novelTitle}
                                fill
                                sizes="60px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600">
                                <BookOpen className="w-6 h-6" />
                              </div>
                            )}
                          </div>

                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className={`text-sm font-bold line-clamp-1 transition-colors ${item.isDeleted ? 'text-slate-400' : 'text-slate-100 group-hover:text-ocean-600 dark:group-hover:text-ocean-400'}`}>
                                {item.novelTitle}
                              </h3>
                              {item.isDeleted && (
                                <span className="shrink-0 text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded-md">
                                  {t('novelDeletedBadge')}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-amber-400 font-semibold line-clamp-1">
                              {t('readUpTo')} {t('chapterPrefix')} {item.lastChapterNumber} • {item.lastChapterTitle}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <span>{t('readPercent')}{item.scrollPercent}%</span>
                              <span>•</span>
                              <span>{formatTimeAgo(item.lastReadAt)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            onClick={() => handleRemoveHistory(item.novelId)}
                            className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-all"
                            title={t('deleteFromHistoryTooltip')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          {item.isDeleted ? (
                            <span
                              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-slate-800 text-slate-500 rounded-xl cursor-not-allowed select-none"
                              title={t('novelDeletedBadge')}
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{t('novelDeletedUnavailable')}</span>
                            </span>
                          ) : (
                            <Link
                              href={`/reader/${item.lastChapterId}${item.scrollPercent ? `?p=${item.scrollPercent}` : ''}`}
                              scroll={false}
                              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl shadow-md transition-all active:scale-95"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{t('btnReadContinue')}</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ----------------- TAB 3: BOOKMARKS ----------------- */}
            {activeTab === 'bookmarks' && (
              <div className="space-y-6">
                <p className="text-xs text-slate-400">
                  {t('bookmarksTabDesc')}
                </p>

                {bookmarksList.length === 0 ? (
                  <div className="py-20 text-center space-y-4 max-w-sm mx-auto">
                    <div className="w-16 h-16 rounded-3xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
                      <Bookmark className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-bold text-slate-200">{t('bookmarksEmptyTitle')}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {t('bookmarksEmptyDesc')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookmarksList.map((bm) => (
                      <div
                        key={bm.id}
                        className="group p-4 sm:p-5 bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-amber-400 font-bold">
                            <Bookmark className="w-4 h-4 fill-amber-400" />
                            <span>{bm.novelTitle}</span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-100 line-clamp-1">
                            {t('chapterPrefix')} {bm.chapterNumber}: {bm.chapterTitle}
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            {t('bookmarkedAt')}{formatTimeAgo(bm.createdAt)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            onClick={() => handleRemoveBookmark(bm)}
                            className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-xl transition-all"
                            title={t('removeBookmarkTooltip')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          <Link
                            href={`/reader/${bm.chapterId}`}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl shadow-md transition-all active:scale-95"
                          >
                            <span>{t('btnOpenChapter')}</span>
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
