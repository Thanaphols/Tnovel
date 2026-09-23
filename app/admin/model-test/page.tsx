'use client';

import React, { useEffect, useState } from 'react';
import { FlaskConical, Play, Plus, X, Loader2, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import FandomSelect from '@/components/FandomSelect';

type Provider = 'gemini' | 'openrouter' | 'ollama';

interface Lane {
  id: number;
  provider: Provider;
  model: string;
  status: 'idle' | 'running' | 'done' | 'error';
  paragraphs?: string[];
  ms?: number;
  failedBatches?: number;
  totalBatches?: number;
  error?: string;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: 'Gemini API',
  openrouter: 'OpenRouter',
  ollama: 'Ollama Local',
};

const SAMPLE = `Chapter 1: The Awakening
Lin Feng opened his eyes and found himself lying in a cold, damp cave.
"Where am I?" he muttered, clutching his throbbing head.
A faint blue light flickered in the darkness, and a mechanical voice rang out in his mind: [System activated. Welcome, Host.]`;

let nextId = 1;

export default function AdminModelTestPage() {
  const [text, setText] = useState(SAMPLE);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [fandomId, setFandomId] = useState('');
  const [glossaryCount, setGlossaryCount] = useState(0);

  // Seed one lane per provider with the model currently configured on the server.
  useEffect(() => {
    fetch('/api/admin/ai-settings')
      .then((r) => r.json())
      .then((data) => {
        const s = data?.settings || {};
        setLanes([
          { id: nextId++, provider: 'gemini', model: s.geminiModel || '', status: 'idle' },
          { id: nextId++, provider: 'openrouter', model: s.openrouterModel || '', status: 'idle' },
          { id: nextId++, provider: 'ollama', model: s.ollamaModel || '', status: 'idle' },
        ]);
      })
      .catch(() => {});
  }, []);

  const patchLane = (id: number, patch: Partial<Lane>) =>
    setLanes((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  async function runLane(lane: Lane, thDraft: string[]) {
    patchLane(lane.id, { status: 'running', paragraphs: undefined, error: undefined, ms: undefined });
    try {
      const res = await fetch('/api/admin/model-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fandomId, draft: thDraft, provider: lane.provider, model: lane.model }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      patchLane(lane.id, {
        status: data.failedBatches > 0 ? 'error' : 'done',
        paragraphs: data.paragraphs,
        ms: data.ms,
        failedBatches: data.failedBatches,
        totalBatches: data.totalBatches,
        error: data.failedBatches > 0 ? data.lastError || 'บาง batch ล้มเหลว ใช้ร่าง Google แทน' : undefined,
      });
    } catch (err: any) {
      patchLane(lane.id, { status: 'error', error: err.message || 'ทดสอบไม่สำเร็จ' });
    }
  }

  async function runAll() {
    setError(null);
    setDraftLoading(true);
    try {
      const res = await fetch('/api/admin/model-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fandomId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setDraft(data.draft);
      setGlossaryCount(data.glossaryCount || 0);
      // Lanes run in parallel; the server-side concurrency gate still queues same-provider calls.
      lanes.forEach((l) => runLane(l, data.draft));
    } catch (err: any) {
      setError(err.message || 'แปลร่างไม่สำเร็จ');
    } finally {
      setDraftLoading(false);
    }
  }

  const running = draftLoading || lanes.some((l) => l.status === 'running');

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
          <FlaskConical className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">ทดสอบแปลเทียบโมเดล</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            ใส่ต้นฉบับภาษาอังกฤษ (1 บรรทัด = 1 ย่อหน้า, บรรทัดแรกคือชื่อตอน) ระบบจะแปลร่างด้วย Google
            ครั้งเดียว แล้วให้แต่ละโมเดลเกลาเทียบกัน ไม่บันทึกลงฐานข้อมูล
          </p>
        </div>
      </div>

      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <label htmlFor="model-test-text" className="text-xs font-bold text-slate-300">
          ต้นฉบับภาษาอังกฤษ
        </label>
        <textarea
          id="model-test-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={20000}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
        />

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="text-xs font-bold text-slate-300 sm:w-44">Fandom (คำศัพท์)</p>
          <div className="flex-1">
            <FandomSelect value={fandomId} onChange={(id) => setFandomId(id)} disabled={running} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-300">โมเดลที่จะทดสอบ</p>
          {lanes.map((lane) => (
            <div key={lane.id} className="flex flex-col sm:flex-row gap-2">
              <select
                aria-label="Provider"
                value={lane.provider}
                disabled={running}
                onChange={(e) => patchLane(lane.id, { provider: e.target.value as Provider })}
                className="sm:w-44 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200"
              >
                {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </select>
              <input
                aria-label="Model"
                value={lane.model}
                disabled={running}
                onChange={(e) => patchLane(lane.id, { model: e.target.value })}
                placeholder="ชื่อโมเดล (ว่าง = ค่าเริ่มต้น)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-200"
              />
              <button
                type="button"
                disabled={running}
                onClick={() => setLanes((prev) => prev.filter((l) => l.id !== lane.id))}
                className="p-2 text-slate-500 hover:text-rose-400 disabled:opacity-40 self-end sm:self-auto"
                aria-label="ลบโมเดลนี้"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={running}
            onClick={() =>
              setLanes((prev) => [...prev, { id: nextId++, provider: 'openrouter', model: '', status: 'idle' }])
            }
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-amber-300 disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> เพิ่มโมเดล
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={running || !text.trim() || lanes.length === 0}
            onClick={runAll}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-md shadow-amber-500/20 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'กำลังทดสอบ...' : 'เริ่มทดสอบ'}
          </button>
          {error && (
            <span className="text-xs text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
        </div>
      </div>

      {draft && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ResultCard
            title="Google Translate (ร่าง)"
            subtitle={fandomId ? `ล็อกคำ fandom ${glossaryCount} คำ` : undefined}
            paragraphs={draft}
          />
          {lanes.map((lane) => (
            <ResultCard
              key={lane.id}
              title={PROVIDER_LABEL[lane.provider]}
              subtitle={lane.model || 'ค่าเริ่มต้น'}
              lane={lane}
              paragraphs={lane.paragraphs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  title,
  subtitle,
  lane,
  paragraphs,
}: {
  title: string;
  subtitle?: string;
  lane?: Lane;
  paragraphs?: string[];
}) {
  return (
    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col min-w-0">
      <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-100">{title}</p>
          {subtitle && <p className="text-[11px] font-mono text-amber-300/80 truncate">{subtitle}</p>}
        </div>
        {lane && (
          <div className="flex-shrink-0 text-[11px] text-right">
            {lane.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-amber-400" />}
            {lane.status === 'done' && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />}
            {lane.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 ml-auto" />}
            {lane.ms != null && (
              <span className="flex items-center gap-1 text-slate-400 mt-1">
                <Clock className="w-3 h-3" /> {(lane.ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}
      </div>

      {lane?.error && (
        <p className="mb-3 p-2 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg break-words">
          {lane.failedBatches ? `ล้มเหลว ${lane.failedBatches}/${lane.totalBatches} batch: ` : ''}
          {lane.error}
        </p>
      )}

      {paragraphs ? (
        <div className="space-y-2 text-sm leading-relaxed text-slate-200">
          {paragraphs.map((p, i) => (
            <p key={i} className={i === 0 ? 'font-bold text-slate-100' : ''}>
              {p}
            </p>
          ))}
        </div>
      ) : lane?.status === 'running' ? (
        <p className="text-xs text-slate-500">กำลังเกลาสำนวน...</p>
      ) : null}
    </div>
  );
}
