'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Check, X, Loader2 } from 'lucide-react';

export interface FandomOption {
  id: string;
  name: string;
  termCount: number;
}

/** Fandom <select> ('' = none). Admin-only: the list comes from /api/admin/fandoms. */
export default function FandomSelect({
  value,
  onChange,
  disabled,
  className,
  onLoaded,
}: {
  value: string;
  onChange: (fandomId: string, fandom: FandomOption | null) => void;
  disabled?: boolean;
  className?: string;
  onLoaded?: (fandoms: FandomOption[]) => void;
}) {
  const [fandoms, setFandoms] = useState<FandomOption[]>([]);

  useEffect(() => {
    fetch('/api/admin/fandoms')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setFandoms(data.fandoms);
          onLoaded?.(data.fandoms);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inline "new fandom" so a missing fandom can be created right where it's picked.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/fandoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json().catch(() => ({ error: `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${res.status})` }));
      if (!data.success) throw new Error(data.error || 'สร้าง fandom ไม่สำเร็จ');
      const created: FandomOption = { id: data.fandom.id, name: data.fandom.name, termCount: 0 };
      setFandoms((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id, created);
      setAdding(false);
      setNewName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const iconBtn =
    'shrink-0 p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-amber-300 hover:border-amber-500/40 disabled:opacity-40';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {adding ? (
          <input
            autoFocus
            value={newName}
            maxLength={100}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              // Enter must not submit the surrounding form (scrape drawer)
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              } else if (e.key === 'Escape') setAdding(false);
            }}
            placeholder="ชื่อ fandom ใหม่ เช่น Naruto"
            aria-label="ชื่อ fandom ใหม่"
            className={
              (className || 'w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200') +
              ' min-w-0 flex-1 focus:outline-none focus:border-amber-500/50'
            }
          />
        ) : (
          <select
            aria-label="Fandom"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value, fandoms.find((f) => f.id === e.target.value) ?? null)}
            className={
              (className ||
                'w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/50 cursor-pointer') +
              ' min-w-0 flex-1'
            }
          >
            <option value="">ไม่ระบุ fandom</option>
            {fandoms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.termCount} คำ)
              </option>
            ))}
          </select>
        )}

        {adding ? (
          <>
            <button type="button" onClick={create} disabled={saving || !newName.trim()} className={iconBtn} aria-label="บันทึก fandom">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(null); }} className={iconBtn} aria-label="ยกเลิก">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={disabled}
            className={iconBtn}
            title="สร้าง fandom ใหม่"
            aria-label="สร้าง fandom ใหม่"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
