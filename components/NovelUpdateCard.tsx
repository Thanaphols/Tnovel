'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, CalendarClock } from 'lucide-react';

interface Settings {
  intervalHours: number;
  lastRunAt: string | null;
  lastResult: { checked: number; added: number; failed: number } | null;
  running: boolean;
}

const INTERVALS = [
  { hours: 0, label: 'ปิด' },
  { hours: 1, label: 'ทุก 1 ชม.' },
  { hours: 3, label: 'ทุก 3 ชม.' },
  { hours: 6, label: 'ทุก 6 ชม.' },
  { hours: 12, label: 'ทุก 12 ชม.' },
  { hours: 24, label: 'วันละครั้ง' },
];

/** Admin dashboard: auto-check schedule for new chapters on source sites + "check all now". */
export default function NovelUpdateCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetch('/api/admin/novel-updates', { cache: 'no-store' }).then((r) => r.json());
      if (data.success) setSettings(data.settings);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While a sweep runs, poll so "last run" updates when it finishes.
  useEffect(() => {
    if (!settings?.running) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [settings?.running, load]);

  async function post(body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/novel-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      setSettings(data.settings);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const r = settings?.lastResult;

  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl shadow-lg space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <CalendarClock className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-slate-100">เช็คตอนใหม่จากเว็บต้นทาง</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              ทุกเรื่องที่ดึงมาจาก URL · ตอนใหม่ถูกเพิ่มเข้าสารบัญ และแปลอัตโนมัติเมื่อมีคนเปิดอ่าน
            </p>
          </div>
        </div>
        <button
          onClick={() => post({ runNow: true })}
          disabled={busy || !settings || settings.running}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors self-start sm:self-center"
        >
          {settings?.running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {settings?.running ? 'กำลังเช็ค...' : 'เช็คทุกเรื่องตอนนี้'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
        {INTERVALS.map((o) => (
          <button
            key={o.hours}
            onClick={() => post({ intervalHours: o.hours })}
            disabled={busy || !settings}
            className={`flex-1 min-w-[4.5rem] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              settings?.intervalHours === o.hours
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">
        {settings?.lastRunAt
          ? `เช็คล่าสุด ${new Date(settings.lastRunAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`
          : 'ยังไม่เคยเช็ค'}
        {r && ` · ${r.checked} เรื่อง · ตอนใหม่ ${r.added} ตอน${r.failed ? ` · ดึงไม่ได้ ${r.failed} เรื่อง` : ''}`}
      </p>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
