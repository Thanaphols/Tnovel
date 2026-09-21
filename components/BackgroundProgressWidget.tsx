'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, X, CheckCircle2, ChevronRight, Pause, Play } from 'lucide-react';
import { useSocket } from '@/lib/socket';
import { useLanguage } from '@/lib/languageContext';
import { useAuth } from '@/lib/authContext';

export default function BackgroundProgressWidget() {
  const { t } = useLanguage();
  const { isAdmin, user } = useAuth();
  const [active, setActive] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [novelTitle, setNovelTitle] = useState<string>('');
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [currentChapter, setCurrentChapter] = useState<number>(0);
  const [totalChapters, setTotalChapters] = useState<number>(0);
  const [savedCount, setSavedCount] = useState<number>(0);
  const [percent, setPercent] = useState<number>(0);
  const [completed, setCompleted] = useState(false);
  const [jobType, setJobType] = useState<'batch' | 'single_chapter'>('batch');

  const { socket } = useSocket();

  // Restore active translation state on mount (e.g. after page refresh)
  useEffect(() => {
    if (!isAdmin) return;
    let isMounted = true;

    async function checkActiveStatus() {
      try {
        const res = await fetch('/api/translation/status');
        const data = await res.json();
        if (isMounted && data.success && data.active && data.job) {
          // UI Isolation: skip if job belongs to another user
          if (data.job.initiatorUserId && user?.id && data.job.initiatorUserId !== user.id) {
            return;
          }

          setActive(true);
          setCompleted(false);
          setNovelTitle(data.job.novelTitle || '');
          setChapterTitle(data.job.chapterTitle || '');
          setCurrentChapter(data.job.currentChapter || 1);
          setTotalChapters(data.job.totalChapters || 1);
          setSavedCount(data.job.chapterCount || 0);
          setPercent(data.job.percent || 0);
          setIsPaused(Boolean(data.job.isPaused));
          setStatus(
            data.job.currentChapter > 0
              ? `${t('translating')} ${t('chapterPrefix')} ${data.job.currentChapter}/${data.job.totalChapters}`
              : t('translating')
          );
        }
      } catch (err) {
        console.error('Failed to fetch translation status:', err);
      }
    }

    checkActiveStatus();

    return () => {
      isMounted = false;
    };
  }, [t, isAdmin, user?.id]);

  useEffect(() => {
    if (!socket || !isAdmin) return;

    function handleProgress(data: any) {
      // UI Isolation: If an initiator is specified and it is not the current user, ignore
      if (data.initiatorUserId && user?.id && data.initiatorUserId !== user.id) {
        return;
      }
      if (data.status === 'batch_progress') {
        setActive(true);
        setCompleted(false);
        const isSingle = data.jobType === 'single_chapter';
        setJobType(isSingle ? 'single_chapter' : 'batch');
        setNovelTitle(data.novelTitle || '');
        setChapterTitle(data.chapterTitle || '');
        setCurrentChapter(data.currentChapter || 1);
        setTotalChapters(data.totalChapters || 1);
        if (typeof data.chapterCount === 'number') setSavedCount(data.chapterCount);
        setPercent(data.percent || Math.round(((data.currentChapter || 1) / (data.totalChapters || 1)) * 100));
        setIsPaused(Boolean(data.isPaused));
        if (isSingle) {
          setStatus(`✨ กำลังเกลาสำนวน (${data.currentChapter || 1}/${data.totalChapters || 1} ชุด)`);
        } else {
          setStatus(`${t('translating')} ${t('chapterPrefix')} ${data.currentChapter}/${data.totalChapters}`);
        }
      } else if (data.status === 'batch_completed') {
        setCompleted(true);
        setIsPaused(false);
        setPercent(100);
        setStatus(data.message || t('widgetCompleted'));
        setTimeout(() => {
          setActive(false);
          setCompleted(false);
        }, 5000);
      } else if (data.status === 'batch_cancelled') {
        setActive(false);
        setIsPaused(false);
      }
    }

    function handleState(data: any) {
      if (data.isPaused !== undefined) setIsPaused(data.isPaused);
      if (data.isCancelled) {
        setActive(false);
        setIsPaused(false);
      }
    }

    socket.on('translation:progress', handleProgress);
    socket.on('translation:state', handleState);
    return () => {
      socket.off('translation:progress', handleProgress);
      socket.off('translation:state', handleState);
    };
  }, [socket, t, isAdmin]);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  if (!isAdmin || !active) return null;

  function togglePause() {
    if (!socket) return;
    if (isPaused) {
      socket.emit('translation:resume');
      setIsPaused(false);
    } else {
      socket.emit('translation:pause');
      setIsPaused(true);
    }
  }

  function handleConfirmCancel() {
    if (socket) {
      socket.emit('translation:cancel');
    }
    setActive(false);
    setIsPaused(false);
    setShowCancelConfirm(false);
  }

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40 transition-all duration-300 animate-slide-up">
        {minimized ? (
          /* Minimized Icon Button */
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/95 border border-amber-500/40 backdrop-blur-md rounded-full shadow-xl">
            <button
              onClick={() => setMinimized(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-amber-400 hover:text-amber-300 transition-all"
            >
              <div className="relative flex items-center justify-center">
                {isPaused ? (
                  <Pause className="w-4 h-4 text-amber-400" />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
              </div>
              <span className="text-xs font-semibold text-slate-200">
                {isPaused
                  ? t('widgetPaused')
                  : jobType === 'single_chapter'
                  ? `${percent}% (เกลาสำนวน)`
                  : `${percent}% (${currentChapter}/${totalChapters})`}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {jobType !== 'single_chapter' && (
              <button
                onClick={togglePause}
                className="p-1.5 text-slate-300 hover:text-amber-400 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
                title={isPaused ? t('widgetResume') : t('widgetPause')}
              >
                {isPaused ? <Play className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        ) : (
          /* Full Floating Card */
          <div className="w-80 p-4 bg-slate-900/95 border border-amber-500/30 backdrop-blur-md rounded-2xl shadow-2xl space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 border rounded-xl ${isPaused ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  {completed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : isPaused ? (
                    <Pause className="w-5 h-5 text-amber-400" />
                  ) : (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-100 line-clamp-1">{novelTitle}</p>
                  <p className="text-[11px] font-medium transition-colors">
                    {completed ? (
                      <span className="text-emerald-400">{t('widgetCompleted')}</span>
                    ) : isPaused ? (
                      <span className="text-amber-400 font-semibold">{t('widgetPausedBadge')}</span>
                    ) : (
                      <span className="text-amber-400">{status}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!completed && jobType !== 'single_chapter' && (
                  <button
                    onClick={togglePause}
                    title={isPaused ? t('widgetClickToResume') : t('widgetClickToPause')}
                    className={`p-1.5 rounded-lg border transition-all flex items-center justify-center ${
                      isPaused
                        ? 'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                )}

                <button
                  onClick={() => setMinimized(true)}
                  title={t('widgetMinimize')}
                  className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg text-[10px] transition-colors"
                >
                  {t('widgetMinimize')}
                </button>
                <button
                  onClick={() => {
                    if (jobType === 'single_chapter') {
                      setActive(false);
                    } else {
                      setShowCancelConfirm(true);
                    }
                  }}
                  title={t('widgetCancel')}
                  className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!completed && chapterTitle && (
              <p className="text-[11px] text-slate-400 line-clamp-1 bg-slate-950/60 px-2.5 py-1 rounded-lg">
                📖 {chapterTitle}
              </p>
            )}

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    completed
                      ? 'bg-emerald-400'
                      : isPaused
                      ? 'bg-amber-500'
                      : 'bg-amber-400'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              {jobType === 'single_chapter' ? (
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                  <span className="text-amber-400/90 font-sans">⚡ Qwen 2.5 (Ollama)</span>
                  <span>ชุดที่ {currentChapter}/{totalChapters} ({percent}%)</span>
                </div>
              ) : (
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                  <span className="text-emerald-400/90">{t('widgetSavedCount')}{savedCount} {t('chaptersCount')}</span>
                  <span>{t('widgetScanCount')}{currentChapter}/{totalChapters}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal before Cancelling */}
      {showCancelConfirm && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in cursor-default"
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="relative w-full max-w-sm p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <X className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-100">{t('widgetCancelConfirmTitle')}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('widgetCancelConfirmMsg')} <span className="font-semibold text-slate-200">"{novelTitle}"</span>?
              </p>
              <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl mt-2">
                {t('widgetCancelTip')}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleConfirmCancel}
                className="w-full py-2.5 px-4 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-[0.99] rounded-xl shadow-lg shadow-rose-600/20 transition-all"
              >
                {t('widgetConfirmCancelBtn')}
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="w-full py-2.5 px-4 text-xs font-semibold text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
              >
                {t('widgetResumeBackBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
