'use client';

// Client-side helper for Bookshelf, Reading History, and Bookmarks (Supports both Logged-in & Guest modes)

const GUEST_BOOKSHELF_KEY = 'tnovel_guest_bookshelf';
const GUEST_HISTORY_KEY = 'tnovel_guest_history';
const GUEST_BOOKMARKS_KEY = 'tnovel_guest_bookmarks';

export interface BookshelfNovel {
  id: string;
  titleEn: string;
  titleTh: string;
  coverUrl?: string | null;
  author?: { name: string } | null;
  totalChapters: number;
  viewCount?: number;
  likeCount?: number;
  bookmarkedAt: string;
  lastReadChapter?: {
    id: string;
    chapterNumber: number;
    titleTh: string;
    scrollPercent: number;
    lastReadAt: string;
  } | null;
  unreadCount: number;
  firstChapterId?: string | null;
  latestChapterId?: string | null;
}

export interface ReadingHistoryItem {
  id: string;
  novelId: string;
  novelTitle: string;
  titleEn?: string;
  titleTh?: string;
  coverUrl?: string | null;
  authorName?: string;
  lastChapterId: string;
  lastChapterNumber: number;
  lastChapterTitle: string;
  scrollPercent: number;
  lastReadAt: string;
  isDeleted?: boolean;
}

export interface ChapterBookmarkItem {
  id: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  novelId: string;
  novelTitle: string;
  coverUrl?: string | null;
  authorName?: string;
  note?: string | null;
  createdAt: string;
}

// ----------------------------------------------------
// 1. Bookshelf Helpers
// ----------------------------------------------------

export async function fetchBookshelf(): Promise<{ loggedIn: boolean; novels: BookshelfNovel[] }> {
  try {
    const res = await fetch('/api/bookshelf');
    const data = await res.json();
    if (data.success && data.loggedIn) {
      return { loggedIn: true, novels: data.novels || [] };
    }
  } catch {}

  // Fallback to guest localStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(GUEST_BOOKSHELF_KEY);
      const guestNovels = stored ? JSON.parse(stored) : [];
      return { loggedIn: false, novels: guestNovels };
    } catch {}
  }
  return { loggedIn: false, novels: [] };
}

export async function toggleBookshelf(novel: {
  id: string;
  titleEn: string;
  titleTh: string;
  coverUrl?: string | null;
  author?: { name: string } | null;
  totalChapters?: number;
}): Promise<{ inBookshelf: boolean; message: string }> {
  try {
    const res = await fetch('/api/bookshelf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novelId: novel.id }),
    });
    const data = await res.json();
    if (data.success && !data.guest) {
      return { inBookshelf: data.inBookshelf, message: data.message };
    }
  } catch {}

  // Guest fallback
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(GUEST_BOOKSHELF_KEY);
      let list: BookshelfNovel[] = stored ? JSON.parse(stored) : [];
      const idx = list.findIndex((n) => n.id === novel.id);

      if (idx >= 0) {
        list.splice(idx, 1);
        localStorage.setItem(GUEST_BOOKSHELF_KEY, JSON.stringify(list));
        return { inBookshelf: false, message: 'นำออกจากชั้นหนังสือแล้ว' };
      } else {
        const item: BookshelfNovel = {
          id: novel.id,
          titleEn: novel.titleEn,
          titleTh: novel.titleTh,
          coverUrl: novel.coverUrl,
          author: novel.author,
          totalChapters: novel.totalChapters || 0,
          bookmarkedAt: new Date().toISOString(),
          unreadCount: 0,
        };
        list.unshift(item);
        localStorage.setItem(GUEST_BOOKSHELF_KEY, JSON.stringify(list));
        return { inBookshelf: true, message: 'เพิ่มเข้าชั้นหนังสือแล้ว' };
      }
    } catch {}
  }

  return { inBookshelf: false, message: 'ทำรายการไม่สำเร็จ' };
}

export function isNovelInGuestBookshelf(novelId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(GUEST_BOOKSHELF_KEY);
    const list: BookshelfNovel[] = stored ? JSON.parse(stored) : [];
    return list.some((n) => n.id === novelId);
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// 2. Reading History Helpers
// ----------------------------------------------------

const CACHED_HISTORY_KEY = 'tnovel_cached_reading_history';

export function getCachedReadingHistory(): ReadingHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const cached = localStorage.getItem(CACHED_HISTORY_KEY);
    if (cached) {
      const list = JSON.parse(cached);
      if (Array.isArray(list) && list.length > 0) return list;
    }
    const guest = localStorage.getItem(GUEST_HISTORY_KEY);
    if (guest) {
      const list = JSON.parse(guest);
      if (Array.isArray(list)) return list;
    }
  } catch {}
  return [];
}

export async function fetchReadingHistory(): Promise<{ loggedIn: boolean; history: ReadingHistoryItem[] }> {
  try {
    const res = await fetch('/api/reading-history');
    const data = await res.json();
    if (data.success && data.loggedIn) {
      const hist = data.history || [];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(CACHED_HISTORY_KEY, JSON.stringify(hist));
        } catch {}
      }
      return { loggedIn: true, history: hist };
    }
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(GUEST_HISTORY_KEY);
      const list = stored ? JSON.parse(stored) : [];
      return { loggedIn: false, history: list };
    } catch {}
  }
  return { loggedIn: false, history: [] };
}

export function recordGuestReadingHistory(item: {
  novelId: string;
  novelTitle: string;
  coverUrl?: string | null;
  authorName?: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  scrollPercent: number;
}) {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(GUEST_HISTORY_KEY);
    let list: ReadingHistoryItem[] = stored ? JSON.parse(stored) : [];

    // Remove existing entry for this novel
    list = list.filter((h) => h.novelId !== item.novelId);

    const newEntry: ReadingHistoryItem = {
      id: `guest-hist-${Date.now()}`,
      novelId: item.novelId,
      novelTitle: item.novelTitle,
      coverUrl: item.coverUrl,
      authorName: item.authorName,
      lastChapterId: item.chapterId,
      lastChapterNumber: item.chapterNumber,
      lastChapterTitle: item.chapterTitle,
      scrollPercent: item.scrollPercent,
      lastReadAt: new Date().toISOString(),
    };

    list.unshift(newEntry);
    localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {}
}

export async function clearReadingHistory(novelId?: string): Promise<boolean> {
  try {
    const url = novelId ? `/api/reading-history?novelId=${novelId}` : '/api/reading-history?clearAll=true';
    const res = await fetch(url, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      // Also clear local
      if (typeof window !== 'undefined') {
        if (novelId) {
          const stored = localStorage.getItem(GUEST_HISTORY_KEY);
          let list: ReadingHistoryItem[] = stored ? JSON.parse(stored) : [];
          list = list.filter((h) => h.novelId !== novelId);
          localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(list));

          const cached = localStorage.getItem(CACHED_HISTORY_KEY);
          let cList: ReadingHistoryItem[] = cached ? JSON.parse(cached) : [];
          cList = cList.filter((h) => h.novelId !== novelId);
          localStorage.setItem(CACHED_HISTORY_KEY, JSON.stringify(cList));
        } else {
          localStorage.removeItem(GUEST_HISTORY_KEY);
          localStorage.removeItem(CACHED_HISTORY_KEY);
        }
      }
      return true;
    }
  } catch {}

  if (typeof window !== 'undefined') {
    if (novelId) {
      const stored = localStorage.getItem(GUEST_HISTORY_KEY);
      let list: ReadingHistoryItem[] = stored ? JSON.parse(stored) : [];
      list = list.filter((h) => h.novelId !== novelId);
      localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(list));

      const cached = localStorage.getItem(CACHED_HISTORY_KEY);
      let cList: ReadingHistoryItem[] = cached ? JSON.parse(cached) : [];
      cList = cList.filter((h) => h.novelId !== novelId);
      localStorage.setItem(CACHED_HISTORY_KEY, JSON.stringify(cList));
    } else {
      localStorage.removeItem(GUEST_HISTORY_KEY);
      localStorage.removeItem(CACHED_HISTORY_KEY);
    }
    return true;
  }
  return false;
}

// ----------------------------------------------------
// 3. Bookmarks Helpers
// ----------------------------------------------------

export async function fetchBookmarks(): Promise<{ loggedIn: boolean; bookmarks: ChapterBookmarkItem[] }> {
  try {
    const res = await fetch('/api/bookmarks');
    const data = await res.json();
    if (data.success && data.loggedIn) {
      return { loggedIn: true, bookmarks: data.bookmarks || [] };
    }
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(GUEST_BOOKMARKS_KEY);
      const list = stored ? JSON.parse(stored) : [];
      return { loggedIn: false, bookmarks: list };
    } catch {}
  }
  return { loggedIn: false, bookmarks: [] };
}

export async function toggleChapterBookmark(chapterInfo: {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  novelId: string;
  novelTitle: string;
  coverUrl?: string | null;
  authorName?: string;
  note?: string;
}): Promise<{ isBookmarked: boolean; message: string }> {
  try {
    const res = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: chapterInfo.chapterId, note: chapterInfo.note }),
    });
    const data = await res.json();
    if (data.success && !data.guest) {
      return { isBookmarked: data.isBookmarked, message: data.message };
    }
  } catch {}

  // Guest fallback
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(GUEST_BOOKMARKS_KEY);
      let list: ChapterBookmarkItem[] = stored ? JSON.parse(stored) : [];
      const idx = list.findIndex((b) => b.chapterId === chapterInfo.chapterId);

      if (idx >= 0) {
        list.splice(idx, 1);
        localStorage.setItem(GUEST_BOOKMARKS_KEY, JSON.stringify(list));
        return { isBookmarked: false, message: 'ยกเลิกคั่นหน้านี้แล้ว' };
      } else {
        const newBm: ChapterBookmarkItem = {
          id: `guest-bm-${Date.now()}`,
          chapterId: chapterInfo.chapterId,
          chapterNumber: chapterInfo.chapterNumber,
          chapterTitle: chapterInfo.chapterTitle,
          novelId: chapterInfo.novelId,
          novelTitle: chapterInfo.novelTitle,
          coverUrl: chapterInfo.coverUrl,
          authorName: chapterInfo.authorName,
          note: chapterInfo.note || null,
          createdAt: new Date().toISOString(),
        };
        list.unshift(newBm);
        localStorage.setItem(GUEST_BOOKMARKS_KEY, JSON.stringify(list));
        return { isBookmarked: true, message: 'คั่นหน้านี้เรียบร้อยแล้ว' };
      }
    } catch {}
  }

  return { isBookmarked: false, message: 'เกิดข้อผิดพลาด' };
}
