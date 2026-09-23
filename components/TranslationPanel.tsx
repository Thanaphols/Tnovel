'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  Languages,
  Sparkles,
  Zap,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Loader2,
  Sliders,
  Check,
  Cloud,
  Server,
  Lightbulb,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useAuth } from '@/lib/authContext';
import { deobfuscateThaiText } from '@/lib/thaiUtils';

interface ChapterMeta {
  id: string;
  chapterNumber: number;
  titleEn: string;
  titleTh: string;
  status?: string;
}

interface TranslationPanelProps {
  novelId: string;
  novelTitle: string;
  chapters: ChapterMeta[];
  // patch present → update that one chapter's status locally (no refetch); absent → full refresh.
  onChaptersUpdated?: (patch?: { chapterId: string; status: string }) => void;
}

export default function TranslationPanel({
  novelId,
  novelTitle,
  chapters,
  onChaptersUpdated,
}: TranslationPanelProps) {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();

  // Engine selection
  const [engine, setEngine] = useState<'google' | 'polish'>('polish');
  // AI provider for polish; '' = use server global setting
  const [provider, setProvider] = useState<'' | 'ollama' | 'gemini' | 'openrouter'>('');

  // Scope selection
  const [scope, setScope] = useState<'unfinished' | 'failed' | 'range' | 'all'>('unfinished');
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(Math.min(10, chapters.length || 1));

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [progressCount, setProgressCount] = useState(0);
  const [totalTarget, setTotalTarget] = useState(0);
  const [currentProcessingTitle, setCurrentProcessingTitle] = useState('');
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const isCancelledRef = useRef(false);

  // Status breakdown
  const stats = useMemo(() => {
    let polished = 0;
    let gt = 0;
    let tocOnly = 0;
    let failed = 0;

    for (const c of chapters) {
      if (c.status === 'POLISHED') polished++;
      else if (c.status === 'TRANSLATED_GT') gt++;
      else if (!!c.status && ['POLISH_FAILED', 'TRANSLATE_FAILED', 'FETCH_FAILED'].includes(c.status)) failed++;
      else tocOnly++;
    }

    return {
      total: chapters.length,
      polished,
      gt,
      tocOnly,
      failed,
      polishedPercent: chapters.length > 0 ? Math.round((polished / chapters.length) * 100) : 0,
    };
  }, [chapters]);

  // Determine target chapters based on selected scope
  const targetChapters = useMemo(() => {
    const sorted = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);

    if (scope === 'all') return sorted;
    if (scope === 'unfinished') {
      return sorted.filter((c) => c.status !== 'POLISHED');
    }
    if (scope === 'failed') {
      return sorted.filter((c) => !!c.status && ['POLISH_FAILED', 'TRANSLATE_FAILED', 'FETCH_FAILED'].includes(c.status));
    }
    if (scope === 'range') {
      return sorted.filter(
        (c) => c.chapterNumber >= rangeStart && c.chapterNumber <= rangeEnd
      );
    }
    return sorted;
  }, [chapters, scope, rangeStart, rangeEnd]);

  // Sequential batch runner (Client-driven batch)
  async function handleStartBatch() {
    if (!isAdmin || isRunning || targetChapters.length === 0) return;

    setIsRunning(true);
    isCancelledRef.current = false;
    setProgressCount(0);
    setTotalTarget(targetChapters.length);
    setErrorLog([]);

    for (let i = 0; i < targetChapters.length; i++) {
      if (isCancelledRef.current) break;

      const chap = targetChapters[i];
      const isTocOnly = chap.status === 'TOC_ONLY';
      const actionText = isTocOnly
        ? 'กำลังดึงเนื้อหาและแปล...'
        : engine === 'polish'
        ? 'กำลังเกลาสำนวน (AI)...'
        : 'กำลังแปลด่วน (Google)...';
      setCurrentProcessingTitle(`ตอนที่ ${chap.chapterNumber}: ${chap.titleTh || chap.titleEn} (${actionText})`);

      try {
        const res = await fetch(`/api/chapters/${chap.id}/retranslate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ engine, ...(engine === 'polish' && provider ? { provider } : {}) }),
        });

        // Server can hand back an HTML page (dev overlay / restart / gateway) instead of JSON;
        // parse defensively so the report shows a readable reason, not "Unexpected token '<'".
        const raw = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(raw);
        } catch {
          data = { success: false, error: `เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${res.status})` };
        }
        if (!res.ok || !data.success) {
          setErrorLog((prev) => [
            ...prev,
            `ตอนที่ ${chap.chapterNumber} ขัดข้อง: ${data.error || 'ไม่สำเร็จ'}`,
          ]);
        } else {
          // Update overview stats live as each chapter completes — patch this one chapter's
          // status locally instead of refetching the whole novel on every iteration.
          onChaptersUpdated?.({
            chapterId: chap.id,
            status: engine === 'polish' ? 'POLISHED' : 'TRANSLATED_GT',
          });
        }
      } catch (err: any) {
        setErrorLog((prev) => [
          ...prev,
          `ตอนที่ ${chap.chapterNumber} เชื่อมต่อไม่สำเร็จ: ${err.message}`,
        ]);
      }

      setProgressCount(i + 1);
    }

    setIsRunning(false);
    setCurrentProcessingTitle('');
    if (onChaptersUpdated) {
      onChaptersUpdated();
    }
  }

  function handleCancelBatch() {
    isCancelledRef.current = true;
    setIsRunning(false);
  }

  return (
    <div className="space-y-6">
      {/* 1. Translation Dashboard Overview */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
              <Languages className="w-5 h-5 text-amber-400" />
              <span>สถานะการแปล (Translation Overview)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              สรุปความคืบหน้าการแปลและคุณภาพสำนวนของ &quot;{deobfuscateThaiText(novelTitle)}&quot;
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold font-mono text-amber-400">
              {stats.polishedPercent}%
            </span>
            <span className="text-xs text-slate-400">เกลาสำนวนสมบูรณ์</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-950 rounded-full h-3.5 mt-4 p-0.5 border border-slate-800 flex overflow-hidden">
          <div
            style={{ width: `${(stats.polished / Math.max(1, stats.total)) * 100}%` }}
            className="bg-emerald-500 rounded-full transition-all duration-500"
            title={`เกลาสมบูรณ์: ${stats.polished} ตอน`}
          />
          <div
            style={{ width: `${(stats.gt / Math.max(1, stats.total)) * 100}%` }}
            className="bg-amber-500 transition-all duration-500"
            title={`ร่างแปลด่วน (Google): ${stats.gt} ตอน`}
          />
          <div
            style={{ width: `${(stats.failed / Math.max(1, stats.total)) * 100}%` }}
            className="bg-rose-500 transition-all duration-500"
            title={`ขัดข้อง: ${stats.failed} ตอน`}
          />
        </div>

        {/* Breakdown Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
          <div className="p-3.5 bg-slate-950/70 border border-emerald-500/20 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>แปลเกลาคำแล้ว (AI)</span>
            </div>
            <p className="text-xl font-bold font-mono text-slate-100 mt-2">
              {stats.polished}{' '}
              <span className="text-xs text-slate-500 font-normal">/ {stats.total} ตอน</span>
            </p>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-amber-500/20 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
              <Zap className="w-4 h-4" />
              <span>ร่างแปลด่วน (Google)</span>
            </div>
            <p className="text-xl font-bold font-mono text-slate-100 mt-2">
              {stats.gt}{' '}
              <span className="text-xs text-slate-500 font-normal">/ {stats.total} ตอน</span>
            </p>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-slate-700/40 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
              <Clock className="w-4 h-4" />
              <span>ยังไม่ได้ดึงเนื้อหา</span>
            </div>
            <p className="text-xl font-bold font-mono text-slate-100 mt-2">
              {stats.tocOnly}{' '}
              <span className="text-xs text-slate-500 font-normal">/ {stats.total} ตอน</span>
            </p>
          </div>

          <div className="p-3.5 bg-slate-950/70 border border-rose-500/20 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold">
              <AlertCircle className="w-4 h-4" />
              <span>ต้องแก้ไข / ล้มเหลว</span>
            </div>
            <p className="text-xl font-bold font-mono text-slate-100 mt-2">
              {stats.failed}{' '}
              <span className="text-xs text-slate-500 font-normal">ตอน</span>
            </p>
          </div>
        </div>
      </div>

      {/* 2. Admin Re-translation Control Panel */}
      {isAdmin ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h3 className="text-base sm:text-lg font-bold text-slate-100">
              เครื่องมือแปลใหม่ / เกลาคำซ้ำ (Re-translation Tools)
            </h3>
          </div>

          {/* Engine Choice */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300">เลือกโหมดการแปล (Engine):</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setEngine('polish')}
                className={`flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                  engine === 'polish'
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-slate-200">แปลเกลาคำ (AI Polish)</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ใช้ AI ตรวจสอบสำนวนวรรณกรรม ถอดเสียงชื่อเฉพาะภาษาไทย และปรับบริบทให้สละสลวย
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={isRunning}
                onClick={() => setEngine('google')}
                className={`flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                  engine === 'google'
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-slate-200">แปลเร็ว (Google Translate)</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    แปลตรงความหมายจากภาษาอังกฤษทันที พร้อมผูกคำจากตาราง Glossary (ความเร็วสูง)
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* AI Provider (polish only) */}
          {engine === 'polish' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">เครื่อง AI ที่ใช้เกลา (Provider):</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { v: '', label: 'ค่าเริ่มต้น', Icon: Sliders },
                  { v: 'gemini', label: 'Gemini API', Icon: Cloud },
                  { v: 'openrouter', label: 'OpenRouter', Icon: Cloud },
                  { v: 'ollama', label: 'Ollama Local', Icon: Server },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setProvider(o.v)}
                    className={`flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      provider === o.v
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <o.Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scope Choice */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300">เลือกกลุ่มตอนที่ต้องการแปล:</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setScope('unfinished')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all ${
                  scope === 'unfinished'
                    ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                เฉพาะตอนที่ยังไม่สมบูรณ์ ({chapters.filter((c) => c.status !== 'POLISHED').length})
              </button>

              <button
                type="button"
                disabled={isRunning}
                onClick={() => setScope('failed')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all ${
                  scope === 'failed'
                    ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                เฉพาะตอนที่ล้มเหลว ({chapters.filter((c) => !!c.status && ['POLISH_FAILED', 'TRANSLATE_FAILED', 'FETCH_FAILED'].includes(c.status)).length})
              </button>

              <button
                type="button"
                disabled={isRunning}
                onClick={() => setScope('range')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all ${
                  scope === 'range'
                    ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                กำหนดช่วงตอน
              </button>

              <button
                type="button"
                disabled={isRunning}
                onClick={() => setScope('all')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all ${
                  scope === 'all'
                    ? 'bg-amber-400 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                ทุกตอนในเรื่อง ({chapters.length})
              </button>
            </div>

            {/* Range Inputs */}
            {scope === 'range' && (
              <div className="flex items-center gap-2 p-3 bg-slate-950/80 rounded-xl border border-slate-800 w-fit mt-2">
                <span className="text-xs text-slate-400">จากตอนที่</span>
                <input
                  type="number"
                  min={1}
                  max={chapters.length || 1}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isRunning}
                  className="w-16 px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono text-center focus:outline-none focus:border-amber-500"
                />
                <span className="text-xs text-slate-400">ถึงตอนที่</span>
                <input
                  type="number"
                  min={rangeStart}
                  max={chapters.length || 1}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(Math.max(rangeStart, parseInt(e.target.value) || rangeStart))}
                  disabled={isRunning}
                  className="w-16 px-2 py-1 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-mono text-center focus:outline-none focus:border-amber-500"
                />
              </div>
            )}
          </div>

          {/* Action and Progress Bar */}
          <div className="pt-3 border-t border-slate-800 space-y-4">
            {isRunning ? (
              <div className="p-4 bg-slate-950/80 border border-amber-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>กำลังดำเนินการ: {progressCount} / {totalTarget} ตอน</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelBatch}
                    className="flex items-center gap-1 px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded-lg text-xs font-semibold border border-rose-500/30 transition-all"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>หยุดชั่วคราว</span>
                  </button>
                </div>

                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    style={{ width: `${(progressCount / Math.max(1, totalTarget)) * 100}%` }}
                    className="h-full bg-amber-400 transition-all duration-300"
                  />
                </div>

                {currentProcessingTitle && (
                  <p className="text-[11px] text-slate-400 truncate">
                    {currentProcessingTitle}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-400">
                  ตอนที่พร้อมดำเนินการ: <span className="font-bold text-amber-400 font-mono">{targetChapters.length}</span> ตอน
                </p>

                <button
                  type="button"
                  onClick={handleStartBatch}
                  disabled={targetChapters.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>เริ่มแปล {targetChapters.length} ตอน</span>
                </button>
              </div>
            )}

            {/* Errors if any */}
            {errorLog.length > 0 && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-1 text-xs text-rose-300">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>รายงานข้อผิดพลาด:</span>
                </p>
                <div className="max-h-28 overflow-y-auto space-y-0.5 text-[11px] font-mono">
                  {errorLog.map((err, idx) => (
                    <p key={idx}>{err}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl text-xs text-slate-400 flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>ผู้อ่านสามารถตรวจดูสถานะความพร้อมของแต่ละตอนได้จากสารบัญ หากพบบทที่มีคำผิดหรือสำนวนขัดข้อง สามารถกดปุ่มรายงาน (Report) ในหน้าอ่านได้ตลอดเวลา</span>
        </div>
      )}
    </div>
  );
}
