'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Plus,
  Trash2,
  Loader2,
  Search,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Check,
  X,
  ChevronDown,
  Unlink,
  ImageIcon,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { CATEGORY_OPTIONS } from '@/lib/glossaryCategories';

// Fandom glossary as cards: a top-level term (e.g. Luffy) with an optional picture, expanding to
// its variants (Monkey D. Luffy, Straw Hat Luffy...) — fics often dodge the canonical name.

interface Term {
  id: string;
  termEn: string;
  termTh: string;
  category?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
}

const inputCls =
  'w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50';

async function api(endpoint: string, method: string, body?: unknown) {
  const res = await fetch(endpoint, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
  return data;
}

function CategorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { lang } = useLanguage();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} cursor-pointer`}>
      {CATEGORY_OPTIONS.map((c) => (
        <option key={c.id} value={c.id}>
          {lang === 'en' ? c.labelEn : c.labelTh}
        </option>
      ))}
    </select>
  );
}

/** Picture or, when missing/broken, the first letter on a tinted square. */
function Avatar({ term, size }: { term: Term; size: 'sm' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [term.imageUrl]);
  const box = size === 'lg' ? 'w-24 h-24 text-3xl' : 'w-12 h-12 text-lg';
  if (term.imageUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-pasted hosts
      <img
        src={term.imageUrl}
        alt={term.termEn}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`${box} shrink-0 rounded-xl object-cover bg-slate-800 border border-slate-700`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${box} shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold flex items-center justify-center`}
    >
      {term.termEn.charAt(0).toUpperCase()}
    </div>
  );
}

function VariantRow({
  term,
  endpoint,
  onChanged,
  onError,
}: {
  term: Term;
  endpoint: string;
  onChanged: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [en, setEn] = useState(term.termEn);
  const [th, setTh] = useState(term.termTh);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
      setEditing(false);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api(endpoint, 'PUT', { id: term.id, termEn: en.trim(), termTh: th.trim(), category: term.category }));
  };
  const detach = () =>
    run(() => api(endpoint, 'PUT', { id: term.id, termEn: term.termEn, termTh: term.termTh, category: term.category, parentId: null }));
  const remove = () => {
    if (confirm(`ลบคำย่อย "${term.termEn}"?`)) run(() => api(`${endpoint}?glossaryId=${term.id}`, 'DELETE'));
  };

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col sm:flex-row gap-2 p-2 rounded-xl bg-slate-900 border border-amber-500/40">
        <input value={en} onChange={(e) => setEn(e.target.value)} required aria-label="คำอังกฤษ" className={`${inputCls} font-mono`} />
        <input value={th} onChange={(e) => setTh(e.target.value)} required aria-label="คำแปลไทย" className={inputCls} />
        <div className="flex gap-1 justify-end shrink-0">
          <button type="button" onClick={() => setEditing(false)} className="p-2 text-slate-400 hover:text-slate-200 rounded-lg" aria-label="ยกเลิก">
            <X className="w-3.5 h-3.5" />
          </button>
          <button type="submit" disabled={busy || !en.trim() || !th.trim()} className="p-2 rounded-lg bg-amber-400 text-slate-950 disabled:opacity-50" aria-label="บันทึก">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>
    );
  }

  return (
    <li className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
      <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap text-xs">
        <span className="font-mono font-semibold text-slate-200">{term.termEn}</span>
        <span className="text-slate-500">→</span>
        <span className="font-semibold text-amber-400">{term.termTh}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
        <button type="button" onClick={() => setEditing(true)} disabled={busy} className="p-1 text-slate-500 hover:text-amber-400 rounded-lg" title="แก้ไข">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={detach} disabled={busy} className="p-1 text-slate-500 hover:text-sky-300 rounded-lg" title="แยกออกเป็นการ์ดของตัวเอง">
          <Unlink className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={remove} disabled={busy} className="p-1 text-slate-500 hover:text-rose-400 rounded-lg" title="ลบ">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </li>
  );
}

/** Expanded card: edit the main term + picture, manage variants. */
function CardPanel({
  card,
  variants,
  endpoint,
  onChanged,
  onClose,
}: {
  card: Term;
  variants: Term[];
  endpoint: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [en, setEn] = useState(card.termEn);
  const [th, setTh] = useState(card.termTh);
  const [category, setCategory] = useState(card.category || 'name');
  const [imageUrl, setImageUrl] = useState(card.imageUrl || '');
  const [newEn, setNewEn] = useState('');
  const [newTh, setNewTh] = useState('');
  const [busy, setBusy] = useState<'save' | 'add' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'save' | 'add' | 'delete', fn: () => Promise<unknown>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      await onChanged();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const dirty = en !== card.termEn || th !== card.termTh || category !== (card.category || 'name') || imageUrl !== (card.imageUrl || '');

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run('save', async () => {
      const data = await api(endpoint, 'PUT', { id: card.id, termEn: en.trim(), termTh: th.trim(), category, imageUrl: imageUrl.trim() });
      // The server swaps a pasted link for its own compressed copy.
      setImageUrl(data.glossary.imageUrl || '');
    });
  };

  const addVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run('add', () =>
      api(endpoint, 'POST', { termEn: newEn.trim(), termTh: newTh.trim() || card.termTh, category: card.category, parentId: card.id })
    );
    if (ok) {
      setNewEn('');
      setNewTh('');
    }
  };

  const removeCard = async () => {
    const extra = variants.length ? ` พร้อมคำย่อย ${variants.length} คำ` : '';
    if (!confirm(`ลบการ์ด "${card.termEn}"${extra}?`)) return;
    if (await run('delete', () => api(`${endpoint}?glossaryId=${card.id}`, 'DELETE'))) onClose();
  };

  return (
    <div className="p-4 space-y-4 border-t border-slate-800">
      <form onSubmit={save} className="flex flex-col sm:flex-row gap-4">
        <Avatar term={{ ...card, imageUrl: imageUrl.trim() || null }} size="lg" />
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="text-[11px] text-slate-400 space-y-1">
            <span>คำหลัก (EN)</span>
            <input value={en} onChange={(e) => setEn(e.target.value)} required className={`${inputCls} font-mono`} />
          </label>
          <label className="text-[11px] text-slate-400 space-y-1">
            <span>คำแปลไทย (TH)</span>
            <input value={th} onChange={(e) => setTh(e.target.value)} required className={inputCls} />
          </label>
          <label className="text-[11px] text-slate-400 space-y-1">
            <span>หมวดหมู่</span>
            <CategorySelect value={category} onChange={setCategory} />
          </label>
          <label className="text-[11px] text-slate-400 space-y-1">
            <span>ลิงก์รูป (URL)</span>
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} type="text" inputMode="url" placeholder="https://..." className={inputCls} />
          </label>
          <div className="sm:col-span-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={removeCard}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl text-rose-300 border border-rose-500/30 hover:bg-rose-500/10 disabled:opacity-50"
            >
              {busy === 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              ลบการ์ด
            </button>
            <button
              type="submit"
              disabled={busy !== null || !dirty || !en.trim() || !th.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              บันทึก
            </button>
          </div>
        </div>
      </form>

      {error && (
        <p className="p-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-300">
          คำย่อย / ชื่อเรียกอื่น <span className="text-slate-500 font-normal">({variants.length})</span>
        </h4>
        <p className="text-[11px] text-slate-500">
          ชื่อที่นิยายใช้เรียกแทน เช่น ชื่อเต็ม ฉายา หรือสะกดต่าง แต่ละคำมีคำแปลไทยของตัวเองได้ ถ้าคำนั้นเป็นการ์ดอยู่แล้วจะถูกย้ายเข้ามา
        </p>
        {variants.length > 0 && (
          <ul className="space-y-1.5">
            {variants.map((v) => (
              <VariantRow key={v.id} term={v} endpoint={endpoint} onChanged={onChanged} onError={setError} />
            ))}
          </ul>
        )}
        <form onSubmit={addVariant} className="flex flex-col sm:flex-row gap-2">
          <input value={newEn} onChange={(e) => setNewEn(e.target.value)} placeholder="เช่น Monkey D. Luffy, Straw Hat, 萧炎" aria-label="คำย่อยต้นฉบับ" className={`${inputCls} font-mono`} />
          <input value={newTh} onChange={(e) => setNewTh(e.target.value)} placeholder={card.termTh} aria-label="คำแปลไทยของคำย่อย (เว้นว่าง = ใช้คำแปลหลัก)" className={inputCls} />
          <button
            type="submit"
            disabled={busy !== null || !newEn.trim()}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-50"
          >
            {busy === 'add' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            เพิ่มคำ
          </button>
        </form>
      </div>
    </div>
  );
}

export default function FandomGlossaryCards({ fandomId }: { fandomId: string }) {
  const { lang } = useLanguage();
  const endpoint = `/api/admin/fandoms/${fandomId}/glossary`;
  const [items, setItems] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [en, setEn] = useState('');
  const [th, setTh] = useState('');
  const [category, setCategory] = useState('name');
  const [imageUrl, setImageUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success) setItems(data.glossaries || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setExpandedId(null);
    load();
  }, [endpoint]);

  const { cards, variantsOf } = useMemo(() => {
    const variantsOf = new Map<string, Term[]>();
    for (const t of items) {
      if (t.parentId) variantsOf.set(t.parentId, [...(variantsOf.get(t.parentId) || []), t]);
    }
    return { cards: items.filter((t) => !t.parentId), variantsOf };
  }, [items]);

  const q = search.trim().toLowerCase();
  const hit = (t: Term) => t.termEn.toLowerCase().includes(q) || t.termTh.toLowerCase().includes(q);
  const visible = cards.filter(
    (c) => (!catFilter || (c.category || 'name') === catFilter) && (!q || hit(c) || (variantsOf.get(c.id) || []).some(hit))
  );

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await api(endpoint, 'POST', { termEn: en.trim(), termTh: th.trim(), category, imageUrl: imageUrl.trim() });
      setEn('');
      setTh('');
      setImageUrl('');
      setSuccess(`เพิ่มการ์ด "${data.glossary.termEn}" แล้ว`);
      await load();
      setExpandedId(data.glossary.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <BookMarked className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 flex-wrap">
              <span>คำศัพท์ที่ใช้ร่วมกันใน Fandom</span>
              <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-slate-800 text-amber-400 rounded-full border border-slate-700/60">
                {cards.length} การ์ด · {items.length} คำ
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">กดการ์ดเพื่อแก้ไข ใส่รูป และเพิ่มชื่อเรียกอื่นที่นิยายใช้</p>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            aria-label="กรองหมวดหมู่"
            className="px-2 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="">ทุกหมวด</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === 'en' ? c.labelEn : c.labelTh}
              </option>
            ))}
          </select>
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาคำศัพท์..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      </div>

      <form onSubmit={addCard} className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-2xl space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Plus className="w-4 h-4 text-amber-400" />
          <span>เพิ่มการ์ดใหม่</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <input value={en} onChange={(e) => setEn(e.target.value)} required placeholder="EN/中文 เช่น Luffy, 林动" aria-label="คำหลักต้นฉบับ" className={`${inputCls} font-mono`} />
          <input value={th} onChange={(e) => setTh(e.target.value)} required placeholder="TH เช่น ลูฟี่" aria-label="คำแปลไทย" className={inputCls} />
          <CategorySelect value={category} onChange={setCategory} />
          <div className="relative">
            <ImageIcon className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} type="text" inputMode="url" placeholder="ลิงก์รูป (ไม่บังคับ)" aria-label="ลิงก์รูป" className={`${inputCls} pl-8`} />
          </div>
        </div>
        {error && (
          <p className="p-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
        {success && (
          <p className="p-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {success}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={adding || !en.trim() || !th.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            เพิ่มการ์ด
          </button>
        </div>
      </form>

      {loading ? (
        <div className="py-12 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <span className="text-xs">กำลังโหลดคำศัพท์...</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="py-12 text-center bg-slate-950/40 rounded-2xl border border-slate-800/40">
          <BookMarked className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">{q || catFilter ? 'ไม่พบคำศัพท์ที่ตรงกับการค้นหา' : 'ยังไม่มีคำศัพท์ใน fandom นี้'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {visible.map((card) => {
            const variants = variantsOf.get(card.id) || [];
            const open = expandedId === card.id;
            const catInfo = CATEGORY_OPTIONS.find((c) => c.id === (card.category || 'name'));
            return (
              <div
                key={card.id}
                className={`rounded-2xl border transition-all ${
                  open ? 'sm:col-span-2 xl:col-span-3 bg-slate-950 border-amber-500/40' : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : card.id)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <Avatar term={card} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-100 font-mono truncate">{card.termEn}</p>
                    <p className="text-sm font-semibold text-amber-400 truncate">{card.termTh}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {lang === 'en' ? catInfo?.labelEn : catInfo?.labelTh}
                      {variants.length > 0 && <span className="text-sky-300"> · +{variants.length} คำ</span>}
                    </p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <CardPanel
                    key={card.id}
                    card={card}
                    variants={variants}
                    endpoint={endpoint}
                    onChanged={load}
                    onClose={() => setExpandedId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
