'use client';

import React, { useEffect, useState } from 'react';
import { Library, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import GlossaryEditor from '@/components/GlossaryEditor';

interface Fandom {
  id: string;
  name: string;
  termCount: number;
  novelCount: number;
}

export default function AdminFandomsPage() {
  const [fandoms, setFandoms] = useState<Fandom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/fandoms');
      const data = await res.json();
      if (data.success) {
        setFandoms(data.fandoms);
        setSelectedId((cur) => cur ?? data.fandoms[0]?.id ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/fandoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setNewName('');
      setSelectedId(data.fandom.id);
      await load();
    } catch (err: any) {
      setError(err.message || 'สร้าง fandom ไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(f: Fandom) {
    if (
      !confirm(
        `ลบ fandom "${f.name}" พร้อมคำศัพท์ ${f.termCount} คำ?\nนิยาย ${f.novelCount} เรื่องจะถูกยกเลิกการผูก fandom (คำศัพท์ของแต่ละเรื่องยังอยู่)`
      )
    )
      return;
    const res = await fetch(`/api/admin/fandoms?id=${f.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) return alert(data.error || 'ลบไม่สำเร็จ');
    if (selectedId === f.id) setSelectedId(null);
    await load();
  }

  const selected = fandoms.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
          <Library className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Fandom และคำศัพท์ที่ใช้ร่วมกัน</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            นิยายแฟนฟิคที่ผูกกับ fandom เดียวกันจะใช้คำชุดนี้ร่วมกันทั้งตอนแปล Google และตอน AI เกลา
            เพิ่มคำได้ที่นี่ หรือย้ายคำที่ตรวจแล้วจากแท็บ Glossary ของนิยาย
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 self-start">
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="เช่น Naruto, Harry Potter"
              aria-label="ชื่อ fandom ใหม่"
              maxLength={100}
              className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/50"
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="p-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-50"
              aria-label="สร้าง fandom"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          </form>
          {error && (
            <p className="text-[11px] text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </p>
          )}

          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-amber-400 mx-auto my-4" />
          ) : fandoms.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">ยังไม่มี fandom</p>
          ) : (
            <ul className="space-y-1">
              {fandoms.map((f) => (
                <li key={f.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    className={`flex-1 min-w-0 text-left px-3 py-2 rounded-xl text-sm transition-all ${
                      f.id === selectedId
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="block truncate">{f.name}</span>
                    <span className={`text-[10px] ${f.id === selectedId ? 'text-slate-800' : 'text-slate-500'}`}>
                      {f.termCount} คำ · {f.novelCount} เรื่อง
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(f)}
                    className="p-1.5 text-slate-600 hover:text-rose-400 opacity-60 group-hover:opacity-100"
                    aria-label={`ลบ fandom ${f.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 sm:p-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl min-w-0">
          {selected ? (
            <GlossaryEditor key={selected.id} fandomId={selected.id} />
          ) : (
            <p className="text-xs text-slate-500 text-center py-10">สร้างหรือเลือก fandom ทางซ้าย</p>
          )}
        </div>
      </div>
    </div>
  );
}
