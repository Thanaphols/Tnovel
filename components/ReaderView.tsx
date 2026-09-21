'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, Languages, ChevronLeft, ChevronRight, Share2, BookOpen, AlertCircle, Sparkles, Loader2, RefreshCw, X, Bookmark } from 'lucide-react';
import ReaderSettings from './ReaderSettings';
import ReportModal from './ReportModal';
import ChapterListDrawer from './ChapterListDrawer';
import { useSocket } from '@/lib/socket';
import { ReaderSettingsState, saveReaderSettings, getReaderSettings, saveChapterOffline, getChapterOffline } from '@/lib/db';
import { toggleChapterBookmark, recordGuestReadingHistory } from '@/lib/bookshelf';
import { useAppTheme } from '@/lib/themeContext';
import { useLanguage } from '@/lib/languageContext';
import { deobfuscateThaiText } from '@/lib/thaiUtils';

interface ReaderViewProps {
  chapter: {
    id: string;
    chapterNumber: number;
    titleEn: string;
    titleTh: string;
    contentEn: string[];
    contentTh: string[];
    originalUrl: string;
    novelId: string;
    novelTitle: string;
    authorName: string;
    status?: string;
    errorCode?: string;
    errorMessage?: string;
    allChapters?: Array<{ id: string; chapterNumber: number; titleTh: string; status?: string }>;
    savedScrollPercent?: number;
  };
}

interface LoadedChapter {
  id: string;
  chapterNumber: number;
  titleEn: string;
  titleTh: string;
  contentEn: string[];
  contentTh: string[];
  originalUrl: string;
  novelId: string;
  novelTitle: string;
  authorName: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
}

export default function ReaderView({ chapter }: ReaderViewProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { socket } = useSocket();
  const { theme: appTheme, setTheme: setAppTheme } = useAppTheme();

  // Mark document as reader-active so global light/sepia site rules don't pollute reader view
  useEffect(() => {
    document.documentElement.classList.add('reader-active');
    return () => {
      document.documentElement.classList.remove('reader-active');
    };
  }, []);

  const [loadedChapters, setLoadedChapters] = useState<LoadedChapter[]>([chapter]);
  const [activeChapterId, setActiveChapterId] = useState<string>(chapter.id);
  const [isLoadingNext, setIsLoadingNext] = useState(false);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingNextRef = useRef(false);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isTOCDrawerOpen, setIsTOCDrawerOpen] = useState(false);
  const [allChapters, setAllChapters] = useState(chapter.allChapters || []);
  const [isCheckingNext, setIsCheckingNext] = useState(false);
  const [newChapterToast, setNewChapterToast] = useState<{ id: string; chapterNumber: number } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRetranslating, setIsRetranslating] = useState(false);
  const [retranslateToast, setRetranslateToast] = useState<{ ok: boolean; message: string } | null>(null);
  const [isCurrentChapterBookmarked, setIsCurrentChapterBookmarked] = useState(false);

  // Smart back navigation: return to referrer (e.g. index '/' vs novel overview '/novels/[id]')
  const [backUrl, setBackUrl] = useState<string>(() => {
    return chapter.novelId ? `/novels/${chapter.novelId}` : '/';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let fromParam: string | null = null;
    try {
      fromParam = new URLSearchParams(window.location.search).get('from');
    } catch {}

    // 1. Explicit query param (?from=home or ?from=novel or ?from=...)
    if (fromParam) {
      const target =
        fromParam === 'home' || fromParam === 'index'
          ? '/'
          : fromParam === 'novel' && chapter.novelId
            ? `/novels/${chapter.novelId}`
            : fromParam;
      try {
        sessionStorage.setItem('tnovel_reader_return_url', target);
      } catch {}
      setBackUrl(target);
      return;
    }

    // 2. Reader-specific stored return url
    try {
      const stored = sessionStorage.getItem('tnovel_reader_return_url');
      if (stored) {
        setBackUrl(stored);
        return;
      }
    } catch {}

    // 3. General last visited non-reader page
    try {
      const prevNonReader = sessionStorage.getItem('tnovel_prev_non_reader_url');
      if (prevNonReader) {
        if (prevNonReader.startsWith('/novels/')) {
          const prevNovelId = prevNonReader.split('/')[2];
          if (prevNovelId && chapter.novelId && prevNovelId !== chapter.novelId) {
            setBackUrl(`/novels/${chapter.novelId}`);
            return;
          }
        }
        setBackUrl(prevNonReader);
        return;
      }
    } catch {}

    // 4. Default fallback: novel detail page or home
    setBackUrl(chapter.novelId ? `/novels/${chapter.novelId}` : '/');
  }, [chapter.novelId]);

  function handleBackClick(e: React.MouseEvent) {
    e.preventDefault();
    router.push(backUrl);
  }

  // Check bookmark status when activeChapterId changes
  useEffect(() => {
    let cancelled = false;
    async function checkBm() {
      try {
        const res = await fetch(`/api/bookmarks?chapterId=${activeChapterId}`);
        const data = await res.json();
        if (!cancelled && data.success && data.loggedIn) {
          setIsCurrentChapterBookmarked(!!data.isBookmarked);
          return;
        }
      } catch {}

      // Guest check fallback
      if (!cancelled && typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('tnovel_guest_bookmarks');
          const list = stored ? JSON.parse(stored) : [];
          setIsCurrentChapterBookmarked(list.some((b: any) => b.chapterId === activeChapterId));
        } catch {}
      }
    }
    checkBm();
    return () => {
      cancelled = true;
    };
  }, [activeChapterId]);

  async function handleToggleBookmark() {
    const res = await toggleChapterBookmark({
      chapterId: activeChapter.id,
      chapterNumber: activeChapter.chapterNumber,
      chapterTitle: activeChapter.titleTh || activeChapter.titleEn,
      novelId: activeChapter.novelId,
      novelTitle: activeChapter.novelTitle,
      authorName: activeChapter.authorName,
    });
    setIsCurrentChapterBookmarked(res.isBookmarked);
    setRetranslateToast({ ok: true, message: res.message });
    setTimeout(() => setRetranslateToast(null), 3000);
  }

  // JIT On-Demand State
  const [jitLoadingMap, setJitLoadingMap] = useState<Record<string, boolean>>({});
  const [jitErrorMap, setJitErrorMap] = useState<Record<string, string>>({});
  const [showManualPaste, setShowManualPaste] = useState<Record<string, boolean>>({});
  const [manualTextMap, setManualTextMap] = useState<Record<string, string>>({});
  const [isSubmittingPaste, setIsSubmittingPaste] = useState<Record<string, boolean>>({});
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchingIdsRef = useRef<Set<string>>(new Set());

  const handleJitFetch = useCallback(async (chapId: string) => {
    setJitLoadingMap((prev) => ({ ...prev, [chapId]: true }));
    setJitErrorMap((prev) => {
      const next = { ...prev };
      delete next[chapId];
      return next;
    });

    try {
      const res = await fetch(`/api/chapters/${chapId}/jit-fetch`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.chapter) {
        throw new Error(data.error || 'ดึงเนื้อหาจากเว็บต้นทางไม่สำเร็จ');
      }

      const updated = data.chapter;
      const parsedTh = Array.isArray(updated.contentTh)
        ? updated.contentTh
        : typeof updated.contentTh === 'string' && updated.contentTh.startsWith('[')
        ? JSON.parse(updated.contentTh)
        : [updated.contentTh || ''];
      const parsedEn = Array.isArray(updated.contentEn)
        ? updated.contentEn
        : typeof updated.contentEn === 'string' && updated.contentEn.startsWith('[')
        ? JSON.parse(updated.contentEn)
        : [updated.contentEn || ''];

      setLoadedChapters((prev) =>
        prev.map((c) =>
          c.id === chapId
            ? {
                ...c,
                titleTh: updated.titleTh,
                titleEn: updated.titleEn,
                contentTh: parsedTh,
                contentEn: parsedEn,
                status: updated.status,
              }
            : c
        )
      );
    } catch (err: any) {
      setJitErrorMap((prev) => ({ ...prev, [chapId]: err.message || 'ดึงเนื้อหาไม่สำเร็จ' }));
    } finally {
      setJitLoadingMap((prev) => ({ ...prev, [chapId]: false }));
    }
  }, []);

  const handleManualPasteSubmit = useCallback(async (chapId: string) => {
    const text = manualTextMap[chapId]?.trim();
    if (!text) return;

    setIsSubmittingPaste((prev) => ({ ...prev, [chapId]: true }));
    try {
      const res = await fetch(`/api/chapters/${chapId}/manual-paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textEn: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.chapter) {
        throw new Error(data.error || 'บันทึกและแปลเนื้อหาไม่สำเร็จ');
      }

      const updated = data.chapter;
      const parsedTh = Array.isArray(updated.contentTh)
        ? updated.contentTh
        : JSON.parse(updated.contentTh || '[]');
      const parsedEn = Array.isArray(updated.contentEn)
        ? updated.contentEn
        : JSON.parse(updated.contentEn || '[]');

      setLoadedChapters((prev) =>
        prev.map((c) =>
          c.id === chapId
            ? {
                ...c,
                titleTh: updated.titleTh,
                titleEn: updated.titleEn,
                contentTh: parsedTh,
                contentEn: parsedEn,
                status: updated.status,
              }
            : c
        )
      );
      setShowManualPaste((prev) => ({ ...prev, [chapId]: false }));
    } catch (err: any) {
      alert(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setIsSubmittingPaste((prev) => ({ ...prev, [chapId]: false }));
    }
  }, [manualTextMap]);

  const [settings, setSettings] = useState<ReaderSettingsState>({
    theme: 'dark',
    fontSize: 'md',
    fontFamily: 'serif',
    lineHeight: 'comfort',
    displayMode: 'th',
  });

  // Reset/Initialize loaded chapters when chapter prop changes
  useEffect(() => {
    setLoadedChapters([chapter]);
    setActiveChapterId(chapter.id);
    loadingNextRef.current = false;
    setIsLoadingNext(false);
    setIsMenuOpen(false);
    setRetranslateToast(null);
  }, [chapter.id, chapter.titleTh, chapter.contentTh]);

  // Sync allChapters from prop
  useEffect(() => {
    setAllChapters(chapter.allChapters || []);
  }, [chapter.allChapters]);

  // Auto-hide menu when scrolling to read uninterrupted
  useEffect(() => {
    let lastScroll = window.scrollY;
    function handleScrollClose() {
      if (Math.abs(window.scrollY - lastScroll) > 80) {
        setIsMenuOpen(false);
        lastScroll = window.scrollY;
      }
    }
    window.addEventListener('scroll', handleScrollClose, { passive: true });
    return () => window.removeEventListener('scroll', handleScrollClose);
  }, []);

  // Compute active chapter, prev, next
  const activeChapter = loadedChapters.find((c) => c.id === activeChapterId) || loadedChapters[0] || chapter;
  const activeIndex = allChapters.findIndex((c) => c.id === activeChapter.id);
  const prevChapter = activeIndex > 0 ? allChapters[activeIndex - 1] : null;
  const nextChapter = activeIndex >= 0 && activeIndex < allChapters.length - 1 ? allChapters[activeIndex + 1] : null;

  const lastLoaded = loadedChapters[loadedChapters.length - 1];
  const lastLoadedIndex = allChapters.findIndex((c) => c.id === lastLoaded?.id);
  const hasMoreChapters = lastLoadedIndex >= 0 && lastLoadedIndex < allChapters.length - 1;

  // Stable refs to prevent loadNextChapter from recreating and triggering re-render loops
  const loadedChaptersRef = useRef(loadedChapters);
  loadedChaptersRef.current = loadedChapters;
  const allChaptersRef = useRef(allChapters);
  allChaptersRef.current = allChapters;

  // Auto-load next chapter function
  const loadNextChapter = useCallback(async () => {
    if (loadingNextRef.current) return;
    const curLoaded = loadedChaptersRef.current;
    const curAll = allChaptersRef.current;
    const currentLast = curLoaded[curLoaded.length - 1];
    if (!currentLast) return;

    const currentLastIdx = curAll.findIndex((c) => c.id === currentLast.id);
    if (currentLastIdx < 0 || currentLastIdx >= curAll.length - 1) {
      return; // No more chapters to load
    }

    const nextMeta = curAll[currentLastIdx + 1];
    if (curLoaded.some((c) => c.id === nextMeta.id)) return;

    loadingNextRef.current = true;
    setIsLoadingNext(true);

    try {
      let nextData: any = null;

      try {
        const res = await fetch(`/api/chapters/${nextMeta.id}`);
        const data = await res.json();
        if (data.success && data.chapter) {
          nextData = data.chapter;
        }
      } catch (err) {
        console.warn('Network fetch error for next chapter:', err);
      }

      if (!nextData) {
        const cached = await getChapterOffline(nextMeta.id);
        if (cached) {
          nextData = {
            id: cached.id,
            chapterNumber: cached.chapterNumber || nextMeta.chapterNumber,
            titleEn: cached.titleEn,
            titleTh: cached.titleTh,
            contentEn: Array.isArray(cached.contentEn) ? cached.contentEn : [],
            contentTh: Array.isArray(cached.contentTh) ? cached.contentTh : [],
            originalUrl: cached.originalUrl,
            novelId: chapter.novelId,
            novelTitle: cached.novelTitle || chapter.novelTitle,
            authorName: chapter.authorName,
          };
        }
      }

      if (nextData) {
        saveChapterOffline({
          id: nextData.id,
          originalUrl: nextData.originalUrl,
          titleEn: nextData.titleEn,
          titleTh: nextData.titleTh,
          contentEn: nextData.contentEn,
          contentTh: nextData.contentTh,
          novelTitle: nextData.novelTitle || chapter.novelTitle,
          chapterNumber: nextData.chapterNumber,
          updatedAt: new Date().toISOString(),
        });

        setLoadedChapters((prev) => {
          if (prev.some((c) => c.id === nextData.id)) return prev;
          return [...prev, nextData];
        });
      }
    } catch (e) {
      console.error('Failed to load next chapter:', e);
    } finally {
      loadingNextRef.current = false;
      setIsLoadingNext(false);
    }
  }, [chapter.novelId, chapter.novelTitle, chapter.authorName]);

  // Bottom Sentinel Observer to load next chapter before reaching end
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadNextChapter();
        }
      },
      { rootMargin: '300px', threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadNextChapter]);

  // Re-translate active chapter
  async function handleRetranslate(engine: 'google' | 'polish') {
    const target = loadedChapters.find((c) => c.id === activeChapterId) || loadedChapters[0];
    if (!target) return;

    setIsRetranslating(true);
    setRetranslateToast(null);

    try {
      const res = await fetch(`/api/chapters/${target.id}/retranslate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `${t('retranslateFailed')} (${res.status})`);

      setLoadedChapters((prev) =>
        prev.map((c) => (c.id === target.id ? { ...c, titleTh: data.titleTh, contentTh: data.contentTh } : c))
      );
      saveChapterOffline({
        id: target.id,
        originalUrl: target.originalUrl,
        titleEn: target.titleEn,
        titleTh: data.titleTh,
        contentEn: target.contentEn,
        contentTh: data.contentTh,
        novelTitle: target.novelTitle,
        chapterNumber: target.chapterNumber,
        updatedAt: new Date().toISOString(),
      });
      setRetranslateToast({
        ok: true,
        message:
          engine === 'google'
            ? t('retranslatedGoogleSuccess')
            : data.alreadyPolished
              ? t('alreadyPolished')
              : data.partial
                ? t('polishPartial')
                : t('polishSuccess'),
      });
    } catch (err: any) {
      setRetranslateToast({ ok: false, message: err.message || t('retranslateFailed') });
    } finally {
      setIsRetranslating(false);
      setTimeout(() => setRetranslateToast(null), 6000);
    }
  }

  // Real-time socket listener for new chapters
  useEffect(() => {
    if (!socket) return;

    function handleChapterCreated(data: any) {
      if (data?.novelId === chapter.novelId && data?.chapterId) {
        setAllChapters((prev) => {
          if (prev.some((c) => c.id === data.chapterId)) return prev;
          const updated = [
            ...prev,
            {
              id: data.chapterId,
              chapterNumber: data.chapterNumber || prev.length + 1,
              titleTh: data.chapterTitle || `${t('chapterPrefix')} ${prev.length + 1}`,
            },
          ];
          return updated.sort((a, b) => a.chapterNumber - b.chapterNumber);
        });

        // Show toast if this is the next chapter
        if (data.chapterNumber === chapter.chapterNumber + 1) {
          setNewChapterToast({ id: data.chapterId, chapterNumber: data.chapterNumber });
          setTimeout(() => setNewChapterToast(null), 8000);
        }
      }
    }

    function handleChapterPolished(data: any) {
      if (data?.chapterId) {
        setLoadedChapters((prev) => {
          const exists = prev.some((c) => c.id === data.chapterId);
          if (!exists) return prev;
          // Refetch polished chapter quietly
          fetch(`/api/chapters/${data.chapterId}`)
            .then((r) => r.json())
            .then((res) => {
              if (res.success && res.chapter) {
                setLoadedChapters((current) =>
                  current.map((c) =>
                    c.id === data.chapterId
                      ? {
                          ...c,
                          titleTh: res.chapter.titleTh,
                          contentTh: res.chapter.contentTh,
                          status: 'POLISHED',
                        }
                      : c
                  )
                );
              }
            })
            .catch(() => {});
          return prev;
        });
      }
    }

    socket.on('chapter:created', handleChapterCreated);
    socket.on('chapter:polished', handleChapterPolished);
    return () => {
      socket.off('chapter:created', handleChapterCreated);
      socket.off('chapter:polished', handleChapterPolished);
    };
  }, [socket, chapter.novelId, chapter.chapterNumber]);

  // Auto-trigger JIT fetch for TOC_ONLY chapters when mounted
  useEffect(() => {
    for (const chap of loadedChapters) {
      const rawTh = Array.isArray(chap.contentTh) ? chap.contentTh : [];
      const rawEn = Array.isArray(chap.contentEn) ? chap.contentEn : [];
      const hasNoContent = rawTh.length === 0 && rawEn.length === 0;

      if (
        (chap.status === 'TOC_ONLY' || hasNoContent) &&
        !jitLoadingMap[chap.id] &&
        !jitErrorMap[chap.id]
      ) {
        handleJitFetch(chap.id);
      }
    }
  }, [loadedChapters, jitLoadingMap, jitErrorMap, handleJitFetch]);

  // Dwell-Time Preload Guard: Proactively prefetch Chapter N+1 after 5 seconds of reading Chapter N
  useEffect(() => {
    // 1. Abort any previous pending prefetch request
    if (prefetchAbortRef.current) {
      prefetchAbortRef.current.abort();
      prefetchAbortRef.current = null;
    }

    const curAll = allChaptersRef.current;
    const activeIdx = curAll.findIndex((c) => c.id === activeChapterId);
    if (activeIdx < 0 || activeIdx >= curAll.length - 1) return;

    const nextMeta = curAll[activeIdx + 1];

    // Skip if already loaded or currently prefetching
    const alreadyLoaded = loadedChaptersRef.current.some(
      (c) => c.id === nextMeta.id && (c.contentTh?.length ?? 0) > 0
    );
    if (alreadyLoaded || prefetchingIdsRef.current.has(nextMeta.id)) return;

    // 2. Dwell-time gate: Wait 5 seconds to ensure user is genuinely reading
    const timer = setTimeout(() => {
      const controller = new AbortController();
      prefetchAbortRef.current = controller;
      prefetchingIdsRef.current.add(nextMeta.id);

      fetch(`/api/chapters/${nextMeta.id}/jit-fetch`, {
        method: 'POST',
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.chapter) {
            const updated = data.chapter;
            const parsedTh = Array.isArray(updated.contentTh)
              ? updated.contentTh
              : typeof updated.contentTh === 'string' && updated.contentTh.startsWith('[')
              ? JSON.parse(updated.contentTh)
              : [updated.contentTh || ''];
            const parsedEn = Array.isArray(updated.contentEn)
              ? updated.contentEn
              : typeof updated.contentEn === 'string' && updated.contentEn.startsWith('[')
              ? JSON.parse(updated.contentEn)
              : [updated.contentEn || ''];

            setLoadedChapters((prev) =>
              prev.map((c) =>
                c.id === nextMeta.id
                  ? {
                      ...c,
                      titleTh: updated.titleTh,
                      titleEn: updated.titleEn,
                      contentTh: parsedTh,
                      contentEn: parsedEn,
                      status: updated.status,
                    }
                  : c
              )
            );
          }
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            // Silent error handling for background prefetch
          }
        })
        .finally(() => {
          prefetchingIdsRef.current.delete(nextMeta.id);
          if (prefetchAbortRef.current === controller) {
            prefetchAbortRef.current = null;
          }
        });
    }, 5000);

    return () => {
      clearTimeout(timer);
      if (prefetchAbortRef.current) {
        prefetchAbortRef.current.abort();
        prefetchAbortRef.current = null;
      }
    };
  }, [activeChapterId]);

  // Touch gesture swipe states (Commented out: clashes with mobile system back gesture)
  // const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  // const [swipeOffset, setSwipeOffset] = useState(0);
  // const [swipeHint, setSwipeHint] = useState<string | null>(null);
  // const SWIPE_THRESHOLD = 75;

  // Load saved settings from IndexedDB
  useEffect(() => {
    getReaderSettings().then((saved) => {
      if (saved) {
        setSettings(saved);
        if (saved.theme) {
          setAppTheme(saved.theme);
        }
      } else if (appTheme) {
        setSettings((prev) => ({ ...prev, theme: appTheme }));
      }
    });

    // Save chapter for offline cache
    saveChapterOffline({
      id: chapter.id,
      originalUrl: chapter.originalUrl,
      titleEn: chapter.titleEn,
      titleTh: chapter.titleTh,
      contentEn: chapter.contentEn,
      contentTh: chapter.contentTh,
      novelTitle: chapter.novelTitle,
      chapterNumber: chapter.chapterNumber,
      updatedAt: new Date().toISOString(),
    });
  }, [chapter]);

  // Scroll listener for reading progress bar (%), active chapter detection & auto-load trigger
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    function handleScroll() {
      // 1. Calculate reading progress
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight <= 0) return;
      const currentScroll = window.scrollY;
      const percent = Math.min(100, Math.round((currentScroll / totalHeight) * 100));
      setScrollProgress(percent);

      // 2. Preload next chapter when user is near the bottom
      const scrollBottom = document.documentElement.scrollHeight - window.innerHeight - currentScroll;
      if (scrollBottom < 500) {
        loadNextChapter();
      }

      // 3. Detect which chapter is currently in view
      const sections = document.querySelectorAll('section[data-chapter-id]');
      let currentId = activeChapterId;

      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= window.innerHeight * 0.45 && rect.bottom >= 80) {
          const sid = section.getAttribute('data-chapter-id');
          if (sid) currentId = sid;
        }
      });

      if (currentId && currentId !== activeChapterId) {
        setActiveChapterId(currentId);
        window.history.replaceState(null, '', `/reader/${currentId}`);
      }

      // 4. Debounce saving progress to server for active chapter
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (currentId) {
          fetch(`/api/chapters/${currentId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scrollPercent: percent }),
          }).catch(() => {});

          recordGuestReadingHistory({
            novelId: activeChapter.novelId,
            novelTitle: activeChapter.novelTitle,
            authorName: activeChapter.authorName,
            chapterId: activeChapter.id,
            chapterNumber: activeChapter.chapterNumber,
            chapterTitle: activeChapter.titleTh || activeChapter.titleEn,
            scrollPercent: percent,
          });
        }
      }, 1000);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, [activeChapterId, loadNextChapter]);

  function handleUpdateSettings(newSettings: Partial<ReaderSettingsState>) {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveReaderSettings(updated);
    if (newSettings.theme) {
      setAppTheme(newSettings.theme);
    }
  }

  // Dynamic CSS Typography classes
  const fontSizes = {
    sm: 'text-sm sm:text-base leading-relaxed',
    md: 'text-base sm:text-lg leading-loose',
    lg: 'text-lg sm:text-xl leading-loose',
    xl: 'text-xl sm:text-2xl leading-loose',
  };

  const lineHeights = {
    compact: 'leading-normal',
    comfort: 'leading-relaxed',
    spaced: 'leading-loose',
  };

  const themeStyles = {
    dark: {
      wrapper: 'bg-[#0b0f19] text-slate-100',
      header: 'bg-slate-950/85 border-slate-800 text-slate-100',
      headerTitle: 'text-slate-100',
      headerSubtitle: 'text-slate-400',
      headerBtn: 'hover:bg-slate-800/60 text-slate-300 hover:text-white',
      langBtn: 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20',
      reportBtn: 'text-slate-400 hover:text-rose-400 hover:bg-slate-800/50',
      progressTrack: 'bg-slate-800/40',
      progressBar: 'bg-amber-400',
      divider: 'border-slate-800/80',
      prevBtn: 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 shadow-md',
      nextBtn: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/20',
      disabledBtn: 'bg-slate-900/30 text-slate-600 border border-slate-800/30 cursor-not-allowed opacity-50',
      swipeToast: 'bg-slate-950/95 border-amber-500/40 text-amber-300',
      parallelBox: 'bg-slate-900/60 border-slate-800',
      parallelEn: 'text-slate-400 border-slate-800',
      titleBadge: 'text-amber-400',
      titleText: 'text-slate-100',
      authorText: 'text-slate-400',
      bodyText: 'text-slate-200',
      bottomMenu: 'bg-slate-950/95 border-slate-800 text-slate-100 shadow-2xl shadow-black/80',
      bottomStatusPill: 'bg-slate-950/90 border-slate-800/80 text-slate-300 shadow-lg',
      tocBtn: 'bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-800 shadow-md',
    },
    sepia: {
      wrapper: 'bg-[#f4ecd8] text-[#433422]',
      header: 'bg-[#ede2c8]/95 border-[#dacdb0] text-[#433422]',
      headerTitle: 'text-[#2e2013]',
      headerSubtitle: 'text-[#7a644c]',
      headerBtn: 'hover:bg-[#dfd3b9] text-[#5c462e] hover:text-[#2d2215]',
      langBtn: 'bg-[#c88d46]/15 border-[#c88d46]/40 text-[#8c571e] hover:bg-[#c88d46]/25',
      reportBtn: 'text-[#8c7860] hover:text-rose-700 hover:bg-[#dfd3b9]/60',
      progressTrack: 'bg-[#dfd3b9]/50',
      progressBar: 'bg-[#c88d46]',
      divider: 'border-[#dfd3b9]',
      prevBtn: 'bg-[#ede2c8] hover:bg-[#e4d7ba] text-[#433422] border border-[#dacdb0] shadow-sm',
      nextBtn: 'bg-[#c88d46] hover:bg-[#b87d36] text-[#fbf9f5] font-bold shadow-md shadow-[#c88d46]/20',
      disabledBtn: 'bg-[#ede2c8]/30 text-[#ad9b84] border border-[#dacdb0]/30 cursor-not-allowed opacity-50',
      swipeToast: 'bg-[#ede2c8]/95 border-[#c88d46]/50 text-[#5c3e1e]',
      parallelBox: 'bg-[#ede2c8]/70 border-[#dacdb0]',
      parallelEn: 'text-[#6b543c] border-[#dacdb0]',
      titleBadge: 'text-[#a56824]',
      titleText: 'text-[#2e2013]',
      authorText: 'text-[#7a644c]',
      bodyText: 'text-[#3d2e1e]',
      bottomMenu: 'bg-[#ede2c8]/95 border-[#dacdb0] text-[#433422] shadow-2xl shadow-stone-900/20',
      bottomStatusPill: 'bg-[#ede2c8]/90 border-[#dacdb0]/80 text-[#5c462e] shadow-md',
      tocBtn: 'bg-[#dfd3b9] hover:bg-[#d5c7ab] text-[#433422] border border-[#dacdb0] shadow-sm',
    },
    light: {
      wrapper: 'bg-[#fbf9f5] text-stone-900',
      header: 'bg-white/95 border-stone-200 text-stone-900',
      headerTitle: 'text-stone-900',
      headerSubtitle: 'text-stone-500',
      headerBtn: 'hover:bg-stone-100 text-stone-600 hover:text-stone-900',
      langBtn: 'bg-amber-500/10 border-amber-500/30 text-amber-700 hover:bg-amber-500/20',
      reportBtn: 'text-stone-400 hover:text-rose-600 hover:bg-stone-100',
      progressTrack: 'bg-stone-200/60',
      progressBar: 'bg-amber-500',
      divider: 'border-stone-200',
      prevBtn: 'bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 shadow-sm',
      nextBtn: 'bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold shadow-md shadow-amber-500/20',
      disabledBtn: 'bg-stone-100/40 text-stone-400 border border-stone-200/40 cursor-not-allowed opacity-50',
      swipeToast: 'bg-white/95 border-amber-500/40 text-amber-900',
      parallelBox: 'bg-stone-100/80 border-stone-200',
      parallelEn: 'text-stone-600 border-stone-200',
      titleBadge: 'text-amber-600',
      titleText: 'text-stone-900',
      authorText: 'text-stone-500',
      bodyText: 'text-stone-800',
      bottomMenu: 'bg-white/95 border-stone-200 text-stone-900 shadow-2xl shadow-stone-400/20',
      bottomStatusPill: 'bg-white/90 border-stone-200/80 text-stone-700 shadow-md',
      tocBtn: 'bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 shadow-sm',
    },
  };

  const activeTheme = themeStyles[settings.theme] || themeStyles.dark;

  async function handleCheckNextChapter() {
    if (nextChapter) {
      loadNextChapter();
      return;
    }

    setIsCheckingNext(true);
    try {
      const res = await fetch(`/api/novels/${chapter.novelId}`);
      const data = await res.json();
      if (data.success && data.novel?.chapters?.length > 0) {
        const sorted = data.novel.chapters.sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);
        setAllChapters(sorted);
        setTimeout(() => loadNextChapter(), 100);
      }
    } catch {}
    setIsCheckingNext(false);
  }

  // const isPointerDown = React.useRef(false);

  // Keyboard navigation listener (ArrowLeft / ArrowRight)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (isSettingsOpen || isReportOpen) return;

      if (e.key === 'ArrowLeft' && prevChapter) {
        router.push(`/reader/${prevChapter.id}`);
      } else if (e.key === 'ArrowRight' && nextChapter) {
        router.push(`/reader/${nextChapter.id}`);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevChapter, nextChapter, isSettingsOpen, isReportOpen, router]);

  /*
  // Unified Gesture Handlers (Touch + Mouse Pointer)
  // Commented out: clashes with phone system back gesture (swiping from edges)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"], [role="dialog"], header, nav, .bottom-quick-menu')) {
      return;
    }

    isPointerDown.current = true;
    setTouchStart({ x: e.clientX, y: e.clientY });
    setSwipeOffset(0);
    setSwipeHint(null);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDown.current || !touchStart) return;
    const currentX = e.clientX;
    const currentY = e.clientY;
    const diffX = currentX - touchStart.x;
    const diffY = currentY - touchStart.y;

    // If vertical movement is dominant, ignore horizontal swipe
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
      setSwipeOffset(0);
      setSwipeHint(null);
      return;
    }

    // Swiping Right (diffX > 0) -> Previous Chapter
    if (diffX > 0) {
      if (prevChapter) {
        setSwipeOffset(Math.min(90, diffX * 0.35));
        setSwipeHint(`← ${t('prevChapter')}`);
      } else {
        setSwipeOffset(Math.min(15, diffX * 0.08));
        setSwipeHint(t('noPrevChapter'));
      }
    }
    // Swiping Left (diffX < 0) -> Next Chapter
    else if (diffX < 0) {
      if (nextChapter) {
        setSwipeOffset(Math.max(-90, diffX * 0.35));
        setSwipeHint(`${t('nextChapter')} →`);
      } else {
        setSwipeOffset(Math.max(-15, diffX * 0.08));
        setSwipeHint(t('noNextChapter'));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isPointerDown.current || !touchStart) return;
    isPointerDown.current = false;

    const endX = e.clientX;
    const endY = e.clientY;
    const diffX = endX - touchStart.x;
    const diffY = endY - touchStart.y;

    setTouchStart(null);
    setSwipeOffset(0);
    setSwipeHint(null);

    const isHorizontal = Math.abs(diffX) > Math.abs(diffY);
    if (!isHorizontal) return;

    // Swiping Left (diffX < -SWIPE_THRESHOLD) -> Next Chapter
    if (diffX < -SWIPE_THRESHOLD) {
      if (nextChapter) {
        router.push(`/reader/${nextChapter.id}`);
      }
    }
    // Swiping Right (diffX > SWIPE_THRESHOLD) -> Prev Chapter
    else if (diffX > SWIPE_THRESHOLD) {
      if (prevChapter) {
        router.push(`/reader/${prevChapter.id}`);
      }
    }
  };
  */

  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"], [role="dialog"], header, nav, .bottom-quick-menu')) {
      return;
    }
    const selection = window.getSelection()?.toString();
    if (selection && selection.trim().length > 0) {
      return;
    }
    setIsMenuOpen((prev) => !prev);
  };

  return (
    <div
      /* onPointerDown={handlePointerDown} */
      /* onPointerMove={handlePointerMove} */
      /* onPointerUp={handlePointerUp} */
      /* onPointerCancel={handlePointerUp} */
      onClick={handleContentClick}
      className={`reader-view reader-theme-${settings.theme} min-h-screen flex flex-col transition-colors duration-300 select-none ${activeTheme.wrapper}`}
      /* style={{
        transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
        transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none',
      }} */
    >
      {/* Floating Swipe Hint Toast / Indicator (Commented out)
      {swipeHint && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 border text-xs font-bold rounded-full shadow-2xl backdrop-blur-md transition-all animate-fade-in pointer-events-none flex items-center gap-2 ${activeTheme.swipeToast}`}>
          <span>{swipeHint}</span>
        </div>
      )} */}

      {/* Reader Navigation Top Bar */}
      <header className={`reader-header sticky top-0 z-40 border-b backdrop-blur-md relative ${activeTheme.header}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 max-w-[70%]">
            <Link
              href={backUrl}
              onClick={handleBackClick}
              className={`p-1.5 rounded-xl transition-colors ${activeTheme.headerBtn}`}
              title={t('back')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="truncate">
              <Link
                href={activeChapter.novelId ? `/novels/${activeChapter.novelId}` : "/"}
                className="hover:underline block truncate"
              >
                <h2 className={`text-xs font-bold truncate ${activeTheme.headerTitle}`}>{deobfuscateThaiText(activeChapter.novelTitle)}</h2>
              </Link>
              <p className={`text-[11px] opacity-90 truncate ${activeTheme.headerSubtitle}`}>
                {t('chapterPrefix')} {activeChapter.chapterNumber} • {deobfuscateThaiText(activeChapter.titleTh || activeChapter.titleEn)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Table of Contents / Chapter List Button */}
            <button
              onClick={() => setIsTOCDrawerOpen(true)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${activeTheme.headerBtn}`}
              title={t('tocTitle')}
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">{t('tableOfContents')} ({allChapters.length})</span>
            </button>

            {/* Toggle Language Quick Button */}
            <button
              onClick={() =>
                handleUpdateSettings({
                  displayMode: settings.displayMode === 'th' ? 'en' : settings.displayMode === 'en' ? 'parallel' : 'th',
                })
              }
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border rounded-xl transition-all ${activeTheme.langBtn}`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span className="uppercase">{settings.displayMode}</span>
            </button>

            {/* Settings Trigger */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`p-2 rounded-xl transition-colors ${activeTheme.headerBtn}`}
              title={t('readerSettingsTitle')}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Reading Progress Bar attached right under the headbar */}
        <div className={`absolute -bottom-[1px] inset-x-0 h-1 sm:h-1.5 overflow-hidden transition-all ${activeTheme.progressTrack}`}>
          <div
            className={`h-full transition-all duration-150 ${activeTheme.progressBar}`}
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      </header>

      {/* Main Continuous Chapter Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 space-y-12">
        {loadedChapters.map((chap, chapIndex) => {
          const rawContentTh: string[] = Array.isArray(chap?.contentTh)
            ? chap.contentTh
            : typeof chap?.contentTh === 'string' && (chap.contentTh as string).startsWith('[')
              ? (() => { try { const p = JSON.parse(chap.contentTh as any); return Array.isArray(p) ? p : [String(p)]; } catch { return [chap.contentTh]; } })()
              : typeof chap?.contentTh === 'string' ? [chap.contentTh] : [];
          const contentTh: string[] = rawContentTh.map(deobfuscateThaiText);

          const contentEn: string[] = Array.isArray(chap?.contentEn)
            ? chap.contentEn
            : typeof chap?.contentEn === 'string' && (chap.contentEn as string).startsWith('[')
              ? (() => { try { const p = JSON.parse(chap.contentEn as any); return Array.isArray(p) ? p : [String(p)]; } catch { return [chap.contentEn]; } })()
              : typeof chap?.contentEn === 'string' ? [chap.contentEn] : [];

          const maxParagraphs = Math.max(contentTh.length, contentEn.length);

          return (
            <section
              key={chap.id}
              id={`chapter-${chap.id}`}
              data-chapter-id={chap.id}
              className="space-y-6"
            >
              {/* Title Header */}
              {chapIndex === 0 ? (
                <div className={`border-b pb-6 space-y-2 text-center ${activeTheme.divider}`}>
                  <span className={`text-xs font-bold uppercase tracking-widest ${activeTheme.titleBadge}`}>
                    {t('chapterPrefix')} {chap.chapterNumber}
                  </span>
                  <h1 className={`reader-title text-xl sm:text-2xl font-bold leading-tight ${activeTheme.titleText}`}>
                    {settings.displayMode === 'en' ? chap.titleEn : deobfuscateThaiText(chap.titleTh || chap.titleEn)}
                  </h1>
                  <p className={`reader-author text-xs ${activeTheme.authorText}`}>{t('authorTitle')}{deobfuscateThaiText(chap.authorName)}</p>
                </div>
              ) : (
                <div className={`pt-12 pb-6 border-t-2 border-dashed ${activeTheme.divider} text-center space-y-2`}>
                  <div className="flex items-center justify-center">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full border ${activeTheme.titleBadge} bg-amber-500/10 border-amber-500/30`}>
                      {t('nextChapter')} • {t('chapterPrefix')} {chap.chapterNumber}
                    </span>
                  </div>
                  <h2 className={`reader-title text-xl sm:text-2xl font-bold leading-tight ${activeTheme.titleText}`}>
                    {settings.displayMode === 'en' ? chap.titleEn : deobfuscateThaiText(chap.titleTh || chap.titleEn)}
                  </h2>
                  <p className={`reader-author text-xs ${activeTheme.authorText}`}>{t('authorTitle')}{deobfuscateThaiText(chap.authorName)}</p>
                </div>
              )}

              {/* Paragraphs Loop or JIT Loading/Error */}
              <article
                className={`space-y-6 ${fontSizes[settings.fontSize]} ${lineHeights[settings.lineHeight]} ${
                  settings.fontFamily === 'serif' ? 'font-serif' : 'font-sans'
                }`}
              >
                {maxParagraphs === 0 ? (
                  <div className="py-12 px-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-center space-y-4">
                    {jitLoadingMap[chap.id] ? (
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                        <p className="text-sm font-semibold text-amber-400">กำลังเชื่อมต่อไปยังเว็บต้นทางและแปลเป็นภาษาไทยด่วน...</p>
                        <p className="text-xs text-neutral-400">ระบบแปลและพร้อมอ่านในไม่กี่วินาที (และส่งเกลาสำนวน AI ในพื้นหลัง)</p>
                        <div className="w-full max-w-md space-y-2 pt-4">
                          <div className="h-3 bg-amber-500/10 rounded animate-pulse w-full"></div>
                          <div className="h-3 bg-amber-500/10 rounded animate-pulse w-5/6 mx-auto"></div>
                          <div className="h-3 bg-amber-500/10 rounded animate-pulse w-4/6 mx-auto"></div>
                        </div>
                      </div>
                    ) : jitErrorMap[chap.id] ? (
                      <div className="space-y-4">
                        <div className="inline-flex p-3 rounded-full bg-red-500/10 text-red-400">
                          <AlertCircle className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-red-400">ดึงเนื้อหาจากเว็บต้นทางไม่สำเร็จ</h3>
                          <p className="text-xs text-neutral-400">{jitErrorMap[chap.id]}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                          <button
                            onClick={() => handleJitFetch(chap.id)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 text-neutral-950 hover:bg-amber-400 transition"
                          >
                            ลองใหม่อีกครั้ง (Retry)
                          </button>
                          <button
                            onClick={() => setShowManualPaste((prev) => ({ ...prev, [chap.id]: !prev[chap.id] }))}
                            className="px-4 py-2 rounded-xl text-xs font-semibold border border-neutral-700 hover:border-neutral-500 transition"
                          >
                            วางเนื้อหาด้วยตนเอง (Manual Paste)
                          </button>
                        </div>
                        {showManualPaste[chap.id] && (
                          <div className="pt-4 text-left max-w-lg mx-auto space-y-3">
                            <textarea
                              value={manualTextMap[chap.id] || ''}
                              onChange={(e) => setManualTextMap((prev) => ({ ...prev, [chap.id]: e.target.value }))}
                              placeholder="วางข้อความภาษาอังกฤษของบทนี้ที่นี่..."
                              rows={6}
                              className="w-full p-3 rounded-xl border border-neutral-700 bg-neutral-900 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
                            />
                            <button
                              disabled={isSubmittingPaste[chap.id]}
                              onClick={() => handleManualPasteSubmit(chap.id)}
                              className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-neutral-950 hover:bg-amber-400 transition disabled:opacity-50"
                            >
                              {isSubmittingPaste[chap.id] ? 'กำลังบันทึกและแปล...' : 'บันทึกและแปลเป็นภาษาไทยทันที'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-neutral-300">ตอนนี้ยังไม่ได้ดึงเนื้อหาจากเว็บต้นทาง</p>
                        <button
                          onClick={() => handleJitFetch(chap.id)}
                          className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 text-neutral-950 hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
                        >
                          ดึงและแปลภาษาไทยทันที ⚡
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  Array.from({ length: maxParagraphs }).map((_, idx) => {
                    const paragraphTh = contentTh[idx] || '';
                    const paragraphEn = contentEn[idx] || '';

                    if (settings.displayMode === 'en') {
                      return (
                        <p key={idx} className={`reader-paragraph indent-6 text-justify ${activeTheme.bodyText}`}>
                          {paragraphEn}
                        </p>
                      );
                    }

                    if (settings.displayMode === 'parallel') {
                      return (
                        <div key={idx} className={`space-y-2 p-3 border rounded-2xl ${activeTheme.parallelBox}`}>
                          <p className={`reader-paragraph indent-6 text-justify font-medium ${activeTheme.bodyText}`}>{paragraphTh}</p>
                          <p className={`text-xs opacity-75 italic border-t pt-2 ${activeTheme.parallelEn}`}>{paragraphEn}</p>
                        </div>
                      );
                    }

                    // Default Thai
                    return (
                      <p key={idx} className={`reader-paragraph indent-6 text-justify tracking-wide ${activeTheme.bodyText}`}>
                        {paragraphTh}
                      </p>
                    );
                  })
                )}
              </article>
            </section>
          );
        })}

        {/* Loading Next Chapter Spinner Indicator */}
        {isLoadingNext && (
          <div className="py-8 flex flex-col items-center justify-center gap-2.5 text-amber-400">
            <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            <span className="text-xs font-semibold animate-pulse">{t('autoLoadingNextChapter')}</span>
          </div>
        )}

        {/* Sentinel element to trigger auto-load of next chapter */}
        <div ref={bottomSentinelRef} className="h-6" />

        {/* End of Chapters Footer */}
        {!hasMoreChapters && (
          <div className={`pt-10 pb-14 border-t ${activeTheme.divider} space-y-4 text-center`}>
            <p className="text-xs font-semibold text-slate-400">{t('reachedLatestChapter')}</p>
            <div className="flex justify-center">
              <button
                onClick={handleCheckNextChapter}
                disabled={isCheckingNext}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-2xl transition-all ${
                  isCheckingNext ? 'opacity-70' : ''
                } bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 shadow-lg shadow-amber-500/10`}
                title={t('checkNewChapterTooltip')}
              >
                {isCheckingNext ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-400" />
                )}
                <span>{t('checkNewChapter')}</span>
              </button>
            </div>
          </div>
        )}
      </main>



      {/* Quick Navigation Menu (Toggled by tapping the screen) */}
      {isMenuOpen && (
        <div className="fixed bottom-3 inset-x-0 z-40 p-3 sm:p-4 flex justify-center pointer-events-none animate-slide-up">
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bottom-quick-menu pointer-events-auto max-w-lg w-full p-4 rounded-3xl border shadow-2xl backdrop-blur-xl space-y-3 ${
              activeTheme.bottomMenu
            }`}
          >
            {/* Header inside Menu: Chapter info & Actions (Bookmark & Close) */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-2 truncate max-w-[75%]">
                <span className="font-bold text-amber-500 shrink-0">{t('chapterPrefix')} {activeChapter.chapterNumber}</span>
                <span className="opacity-75 truncate">{activeChapter.titleTh || activeChapter.titleEn}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleToggleBookmark}
                  className={`p-1.5 rounded-xl transition-all ${
                    isCurrentChapterBookmarked
                      ? 'text-amber-400 bg-amber-500/20'
                      : 'opacity-60 hover:opacity-100 hover:bg-slate-800/40 text-slate-300'
                  }`}
                  title={isCurrentChapterBookmarked ? t('bookmarkedCurrentChapter') : t('bookmarkCurrentChapter')}
                >
                  <Bookmark className={`w-4 h-4 ${isCurrentChapterBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-slate-800/40 transition-all shrink-0"
                  title={t('closeMenu')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Navigation Buttons: Previous Chapter | Table of Contents | Next Chapter */}
            <div className="grid grid-cols-3 gap-2">
              {/* Previous Chapter */}
              {prevChapter ? (
                <Link
                  href={`/reader/${prevChapter.id}`}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-semibold rounded-2xl transition-all ${activeTheme.prevBtn}`}
                >
                  <ChevronLeft className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t('prevChapter')}</span>
                </Link>
              ) : (
                <button
                  disabled
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-semibold rounded-2xl transition-all ${activeTheme.disabledBtn}`}
                >
                  <ChevronLeft className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t('prevChapter')}</span>
                </button>
              )}

              {/* Table of Contents */}
              <button
                onClick={() => {
                  setIsTOCDrawerOpen(true);
                  setIsMenuOpen(false);
                }}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-semibold rounded-2xl transition-all ${activeTheme.tocBtn}`}
                title={t('selectChapterFromTocTooltip')}
              >
                <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="truncate font-bold">{t('tableOfContents')} ({allChapters.length || activeChapter.chapterNumber})</span>
              </button>

              {/* Next Chapter */}
              {nextChapter ? (
                <Link
                  href={`/reader/${nextChapter.id}`}
                  onClick={() => setIsMenuOpen(false)}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-bold rounded-2xl transition-all ${activeTheme.nextBtn}`}
                >
                  <span className="truncate">{t('nextChapter')}</span>
                  <ChevronRight className="w-4 h-4 shrink-0" />
                </Link>
              ) : (
                <button
                  onClick={() => {
                    handleCheckNextChapter();
                  }}
                  disabled={isCheckingNext}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-2 text-xs font-bold rounded-2xl transition-all bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 shadow-sm`}
                  title={t('checkNewChapterTooltip')}
                >
                  {isCheckingNext ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
                  ) : (
                    <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
                  )}
                  <span className="truncate">{t('checkNewChapter')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <ChapterListDrawer
        isOpen={isTOCDrawerOpen}
        onClose={() => setIsTOCDrawerOpen(false)}
        novelTitle={chapter.novelTitle}
        novelId={chapter.novelId}
        currentChapterId={activeChapter.id}
        chapters={allChapters}
        theme={settings.theme}
      />

      {/* Re-translate result */}
      {retranslateToast && (
        <div
          className={`fixed bottom-24 right-6 z-50 max-w-xs p-4 rounded-2xl shadow-2xl backdrop-blur-xl animate-slide-up flex items-start gap-3 border ${
            retranslateToast.ok ? 'bg-slate-900 border-emerald-500/40' : 'bg-slate-900 border-rose-500/50'
          }`}
        >
          <div
            className={`p-2 rounded-xl ${
              retranslateToast.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}
          >
            {retranslateToast.ok ? <Sparkles className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          </div>
          <p className="text-xs font-medium text-slate-100 leading-relaxed">{retranslateToast.message}</p>
        </div>
      )}

      {/* Floating Toast Notification when next chapter finishes translating */}
      {newChapterToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl backdrop-blur-xl animate-slide-up flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-100">{t('chapterPrefix')} {newChapterToast.chapterNumber} {t('newChapterToastDone')}</p>
            <p className="text-[11px] text-slate-400">{t('newChapterToastReady')}</p>
          </div>
          <Link
            href={`/reader/${newChapterToast.id}`}
            onClick={() => setNewChapterToast(null)}
            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold rounded-xl shadow-md transition-all"
          >
            {t('readNow')}
          </Link>
        </div>
      )}

      {/* Reader Settings Drawer */}
      <ReaderSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onRetranslate={handleRetranslate}
        isRetranslating={isRetranslating}
        onOpenReport={() => setIsReportOpen(true)}
        onToggleBookmark={handleToggleBookmark}
        isBookmarked={isCurrentChapterBookmarked}
      />

      {/* Report Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        novelId={chapter.novelId}
        chapterId={activeChapter.id}
        title={`${activeChapter.novelTitle} - ${t('chapterPrefix')} ${activeChapter.chapterNumber}`}
      />
    </div>
  );
}
