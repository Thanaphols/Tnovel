'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Globe, X, ArrowRight, Loader2, BookOpen, Layers, CheckCircle2, ClipboardPaste } from 'lucide-react';
import { useSocket } from '@/lib/socket';

interface UrlScrapeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UrlScrapeDrawer({ isOpen, onClose }: UrlScrapeDrawerProps) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'auto' | 'single' | 'full_novel'>('auto');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [batchInfo, setBatchInfo] = useState<{ current: number; total: number; title?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<'url' | 'paste'>('url');
  const [pasteNovelTitle, setPasteNovelTitle] = useState('');
  const [pasteChapterTitle, setPasteChapterTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [novelTitles, setNovelTitles] = useState<Array<{ id: string; titleTh: string; titleEn: string }>>([]);
  const router = useRouter();
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    function handleProgress(data: any) {
      if (data.status === 'indexing') {
        setStatusMessage('กำลังกวาดสายตาดึงรายชื่อบทนิยายทั้งหมดจากหน้าหลัก...');
        setProgressPercent(10);
      } else if (data.status === 'scraping') {
        setStatusMessage('กำลังดึงเนื้อหาจากเว็บนิยายต้นฉบับ...');
        setProgressPercent(20);
      } else if (data.status === 'translating') {
        setStatusMessage('กำลังวิเคราะห์และแปลบทนิยายด้วย Gemini AI...');
        setProgressPercent(40);
      } else if (data.status === 'translating_batch') {
        setStatusMessage(`กำลังแปลย่อหน้าชุดที่ ${data.currentBatch}/${data.totalBatches}...`);
        setProgressPercent(40 + Math.round((data.percent || 0) * 0.5));
      } else if (data.status === 'batch_progress') {
        setBatchInfo({ current: data.currentChapter, total: data.totalChapters, title: data.chapterTitle });
        setStatusMessage(`กำลังแอบแปลเบื้องหลังตอนที่ ${data.currentChapter}/${data.totalChapters}: "${data.chapterTitle || ''}"`);
        setProgressPercent(data.percent || Math.round((data.currentChapter / data.totalChapters) * 100));
      } else if (data.status === 'batch_completed') {
        setStatusMessage(data.message || 'แปลนิยายครบทั้งเรื่องเรียบร้อยแล้ว!');
        setProgressPercent(100);
      } else if (data.status === 'completed') {
        setStatusMessage('แปลเรียบร้อยแล้ว! กำลังนำคุณไปยังหน้าอ่าน...');
        setProgressPercent(100);
      }
    }

    socket.on('translation:progress', handleProgress);
    return () => {
      socket.off('translation:progress', handleProgress);
    };
  }, [socket]);

  useEffect(() => {
    if (!isOpen) {
      setAuthed(false);
      return;
    }
    let cancelled = false;
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setAuthed(true);
          fetch('/api/novels?titlesOnly=1')
            .then((r) => r.json())
            .then((d) => {
              if (!cancelled && d.success) setNovelTitles(d.items || []);
            })
            .catch(() => {});
        } else {
          onClose();
          router.push('/login');
        }
      })
      // ponytail: on network failure just open it; the API 401 is the real gate
      .catch(() => {
        if (!cancelled) setAuthed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen || !authed) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setError(null);
    setLoading(true);
    setStatusMessage('กำลังเริ่มต้นระบบดึงข้อมูล...');
    setProgressPercent(5);
    setBatchInfo(null);

    try {
      const res = await fetch('/api/scrape-and-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), mode }),
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error('เกิดข้อผิดพลาดในการรับข้อมูลจากเซิร์ฟเวอร์ กรุณาตรวจสอบฐานข้อมูล');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `เกิดข้อผิดพลาดรหัส ${res.status}`);
      }

      // Dispatch event to refresh novels on homepage immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('novels:refresh'));
      }

      if (data.isBatch) {
        setStatusMessage(data.message);
        setProgressPercent(100);
        setTimeout(() => {
          setLoading(false);
          onClose();
          router.push('/');
        }, 1200);
      } else {
        setStatusMessage('เรียบร้อย! กำลังนำคุณไปยังหน้าอ่านนิยาย...');
        setProgressPercent(100);
        setTimeout(() => {
          setLoading(false);
          onClose();
          router.push(`/reader/${data.chapterId}`);
        }, 500);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'เกิดข้อผิดพลาดในการดึงเนื้อหา');
      setLoading(false);
    }
  }

  async function handlePasteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pasteNovelTitle.trim() || !pasteText.trim()) return;

    setError(null);
    setLoading(true);
    setStatusMessage('กำลังแปลเนื้อหาที่วางไว้...');
    setProgressPercent(30);
    setBatchInfo(null);

    try {
      const res = await fetch('/api/paste-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelTitle: pasteNovelTitle.trim(),
          chapterTitle: pasteChapterTitle.trim(),
          text: pasteText,
        }),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('เกิดข้อผิดพลาดในการรับข้อมูลจากเซิร์ฟเวอร์');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `เกิดข้อผิดพลาดรหัส ${res.status}`);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('novels:refresh'));
      }

      setStatusMessage(`แปลเสร็จ ${data.paragraphCount} ย่อหน้า กำลังเปิดหน้าอ่าน...`);
      setProgressPercent(100);
      setTimeout(() => {
        setLoading(false);
        setPasteText('');
        setPasteChapterTitle('');
        onClose();
        router.push(`/reader/${data.chapterId}`);
      }, 600);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'เกิดข้อผิดพลาดในการเพิ่มตอน');
      setLoading(false);
    }
  }

  const SAMPLE_URLS = [
    { title: 'หน้าหลัก RoyalRoad (ดึงทั้งเรื่อง)', mode: 'full_novel', url: 'https://www.royalroad.com/fiction/21220/mother-of-learning' },
    { title: 'ตอนเฉพาะ (Single Chapter)', mode: 'single', url: 'https://www.royalroad.com/fiction/21220/mother-of-learning/chapter/301778/1-good-morning-brother' },
  ];

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in cursor-pointer sm:cursor-default"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg p-6 bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl space-y-5 cursor-default"
      >
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">เพิ่มนิยายแปลไทย</h3>
            <p className="text-xs text-slate-400">
              {tab === 'url' ? 'ดึงจาก URL เว็บนิยายแล้วแปลอัตโนมัติ' : 'วางเนื้อหาตอนที่คัดลอกมาเองเพื่อแปล'}
            </p>
          </div>
        </div>

        {!loading && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setTab('url'); setError(null); }}
              className={`flex items-center justify-center gap-1.5 p-2.5 text-xs font-semibold rounded-xl border transition-all ${
                tab === 'url'
                  ? 'text-amber-300 bg-amber-500/20 border-amber-500/50'
                  : 'text-slate-400 bg-slate-950 border-slate-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> จาก URL
            </button>
            <button
              type="button"
              onClick={() => { setTab('paste'); setError(null); }}
              className={`flex items-center justify-center gap-1.5 p-2.5 text-xs font-semibold rounded-xl border transition-all ${
                tab === 'paste'
                  ? 'text-amber-300 bg-amber-500/20 border-amber-500/50'
                  : 'text-slate-400 bg-slate-950 border-slate-800'
              }`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" /> แปะเนื้อหาเอง
            </button>
          </div>
        )}

        {error && (
          <div className="p-3.5 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl leading-relaxed">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4 py-4 text-center">
            <div className="relative inline-flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-amber-400 animate-spin" />
              <Sparkles className="w-5 h-5 text-amber-300 absolute" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-200">{statusMessage}</p>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">{progressPercent}% เสร็จสิ้น</p>
            </div>
          </div>
        ) : tab === 'paste' ? (
          <form onSubmit={handlePasteSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">ชื่อเรื่อง</label>
              <input
                type="text"
                value={pasteNovelTitle}
                onChange={(e) => setPasteNovelTitle(e.target.value)}
                list="paste-novel-titles"
                placeholder="เลือกเรื่องเดิม หรือพิมพ์ชื่อเรื่องใหม่"
                required
                className="w-full px-4 py-3 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500 transition-all"
              />
              <datalist id="paste-novel-titles">
                {novelTitles.map((n) => (
                  <option key={n.id} value={n.titleTh || n.titleEn} />
                ))}
              </datalist>
              <p className="text-[11px] text-slate-500">ชื่อตรงกับเรื่องที่มีอยู่ = เพิ่มเป็นตอนถัดไปของเรื่องนั้น</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">ชื่อตอน (ไม่ใส่ก็ได้)</label>
              <input
                type="text"
                value={pasteChapterTitle}
                onChange={(e) => setPasteChapterTitle(e.target.value)}
                placeholder="Chapter 1: ..."
                className="w-full px-4 py-3 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <ClipboardPaste className="w-4 h-4 text-amber-400" /> เนื้อหาต้นฉบับ (ภาษาอังกฤษ)
              </label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={10}
                placeholder="วางเนื้อหาตอนที่นี่ เว้นบรรทัดว่างระหว่างย่อหน้า"
                required
                className="w-full px-4 py-3 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/60 placeholder:text-slate-500 transition-all resize-y"
              />
              <p className="text-[11px] text-slate-500">
                {pasteText.trim() ? `${pasteText.trim().length.toLocaleString()} ตัวอักษร` : 'ยังไม่มีเนื้อหา'}
              </p>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.99] rounded-xl shadow-lg shadow-amber-500/20 transition-all"
            >
              <Sparkles className="w-4 h-4" /> แปลและบันทึกเป็นตอนใหม่
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">โหมดการดึงนิยาย</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('auto')}
                  className={`flex items-center justify-center gap-1.5 p-2.5 text-xs font-semibold rounded-xl border transition-all ${
                    mode === 'auto' || mode === 'full_novel'
                      ? 'text-amber-300 bg-amber-500/20 border-amber-500/50'
                      : 'text-slate-400 bg-slate-950 border-slate-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> ดึงทั้งเรื่องจากหน้าหลัก
                </button>

                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`flex items-center justify-center gap-1.5 p-2.5 text-xs font-semibold rounded-xl border transition-all ${
                    mode === 'single'
                      ? 'text-amber-300 bg-amber-500/20 border-amber-500/50'
                      : 'text-slate-400 bg-slate-950 border-slate-800'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" /> ดึงเฉพาะตอนนี้
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-amber-400" /> URL หน้าหลักนิยาย หรือ URL บทนิยาย
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.royalroad.com/fiction/..."
                required
                className="w-full px-4 py-3 text-sm text-slate-100 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/60 placeholder:text-slate-500 transition-all"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.99] rounded-xl shadow-lg shadow-amber-500/20 transition-all"
            >
              <Sparkles className="w-4 h-4" /> เริ่มต้นดึงและแปลด้วย AI
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="pt-2 border-t border-slate-800/80">
              <p className="text-[11px] text-slate-400 mb-2">ตัวอย่างลิงก์นิยายสำหรับทดลอง:</p>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_URLS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setUrl(sample.url);
                      setMode(sample.mode as any);
                    }}
                    className="text-[11px] px-2.5 py-1 text-slate-400 hover:text-slate-200 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
                  >
                    {sample.title}
                  </button>
                ))}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
