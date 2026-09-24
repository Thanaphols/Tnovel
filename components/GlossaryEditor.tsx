'use client';

import React, { useState, useEffect } from 'react';
import {
  BookMarked,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Search,
  Tag,
  AlertCircle,
  CheckCircle2,
  ArrowUpToLine,
  Pencil,
  Check,
  RotateCcw,
} from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useAuth } from '@/lib/authContext';

interface GlossaryItem {
  id: string;
  termEn: string;
  termTh: string;
  category?: string | null;
  createdAt: string;
}

interface GlossaryEditorProps {
  /** Novel mode: the novel's own terms (auto-extract, promote to fandom). */
  novelId?: string;
  novelTitle?: string;
  /** Novel mode: name of the linked fandom; enables "move to fandom". */
  promoteToFandomName?: string | null;
  /** Fandom mode: edit a fandom's shared terms instead of a novel's. */
  fandomId?: string;
}

const CATEGORY_OPTIONS = [
  { id: 'name', labelTh: 'ชื่อตัวละคร', labelEn: 'Character Name' },
  { id: 'place', labelTh: 'สถานที่', labelEn: 'Location/Place' },
  { id: 'title', labelTh: 'ตำแหน่ง/ยศ', labelEn: 'Title/Rank' },
  { id: 'skill', labelTh: 'ทักษะ/วิชา', labelEn: 'Skill/Technique' },
  { id: 'item', labelTh: 'สิ่งของ/อาวุธ', labelEn: 'Item/Weapon' },
  { id: 'other', labelTh: 'คำเฉพาะอื่นๆ', labelEn: 'Other Term' },
];

export default function GlossaryEditor({ novelId, novelTitle, promoteToFandomName, fandomId }: GlossaryEditorProps) {
  const { t, lang } = useLanguage();
  const { isAdmin } = useAuth();
  const isFandom = Boolean(fandomId);
  const endpoint = isFandom ? `/api/admin/fandoms/${fandomId}/glossary` : `/api/novels/${novelId}/glossary`;
  const canPromote = isAdmin && !isFandom && Boolean(promoteToFandomName);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState(false);

  async function handlePromote(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`ย้าย ${ids.length} คำไปใช้ร่วมกันใน fandom "${promoteToFandomName}"?\nคำจะถูกลบออกจากนิยายเรื่องนี้ และทุกเรื่องใน fandom จะใช้คำนี้`)) return;
    setPromoting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/glossary/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glossaryIds: ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'ย้ายคำไม่สำเร็จ');
      setSuccess(`ย้าย ${data.count} คำไป fandom "${data.fandomName}" แล้ว`);
      setSelected(new Set());
      await fetchGlossary();
    } catch (err: any) {
      setError(err.message || 'ย้ายคำไม่สำเร็จ');
    } finally {
      setPromoting(false);
    }
  }

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [glossaries, setGlossaries] = useState<GlossaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New term form state
  const [termEn, setTermEn] = useState('');
  const [termTh, setTermTh] = useState('');
  const [category, setCategory] = useState('name');

  // Edit term state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTermEn, setEditTermEn] = useState('');
  const [editTermTh, setEditTermTh] = useState('');
  const [editCategory, setEditCategory] = useState('name');
  const [editApplyToChapters, setEditApplyToChapters] = useState(true);
  const [editSaving, setEditSaving] = useState(false);

  // Apply all terms state
  const [applyingAll, setApplyingAll] = useState(false);

  function startEditing(item: GlossaryItem) {
    setEditingId(item.id);
    setEditTermEn(item.termEn);
    setEditTermTh(item.termTh);
    setEditCategory(item.category || 'name');
    setEditApplyToChapters(true);
  }

  function cancelEditing() {
    setEditingId(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editTermEn.trim() || !editTermTh.trim()) return;

    setError(null);
    setSuccess(null);
    setEditSaving(true);

    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          termEn: editTermEn.trim(),
          termTh: editTermTh.trim(),
          category: editCategory,
          applyToChapters: !isFandom && editApplyToChapters,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'แก้ไขคำศัพท์ไม่สำเร็จ');
      }

      setEditingId(null);
      if (data.applied && data.applied.totalReplacements > 0) {
        setSuccess(
          `แก้ไข "${data.glossary.termEn}" สำเร็จ และแทนที่ในเนื้อหา ${data.applied.updatedChapters} ตอน (${data.applied.totalReplacements} จุด)`
        );
      } else {
        setSuccess(`แก้ไขคำศัพท์ "${data.glossary.termEn}" สำเร็จ`);
      }
      fetchGlossary();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการแก้ไขคำศัพท์');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleApplyAllToChapters() {
    if (!novelId || isFandom || glossaries.length === 0) return;
    if (
      !confirm(
        `ต้องการนำคำศัพท์ทั้งหมด (${glossaries.length} คำ) ไปแทนที่ในเนื้อหาทุกตอนที่แปลแล้วหรือไม่?\nระบบจะสแกนและอัปเดตคำในเนื้อหาทันทีโดยไม่ต้องแปลใหม่`
      )
    ) {
      return;
    }

    setApplyingAll(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/novels/${novelId}/glossary/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'แทนที่คำศัพท์ไม่สำเร็จ');
      }

      setSuccess(
        `แทนที่คำศัพท์สำเร็จ: อัปเดต ${data.updatedChapters} จาก ${data.totalChapters} ตอน (แทนที่ทั้งหมด ${data.totalReplacements} จุด)`
      );
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการแทนที่คำศัพท์');
    } finally {
      setApplyingAll(false);
    }
  }

  async function handleAutoExtract() {
    setExtracting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/novels/${novelId}/glossary/extract`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'สแกนคำศัพท์ไม่สำเร็จ');
      }
      setSuccess(data.message);
      await fetchGlossary();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการสแกนคำศัพท์');
    } finally {
      setExtracting(false);
    }
  }

  useEffect(() => {
    setSelected(new Set());
    fetchGlossary();
  }, [endpoint]);

  async function fetchGlossary() {
    try {
      setLoading(true);
      const res = await fetch(endpoint);
      const data = await res.json();
      if (data.success) {
        setGlossaries(data.glossaries || []);
      }
    } catch (err: any) {
      console.error('Failed to load glossary:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!termEn.trim() || !termTh.trim()) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termEn: termEn.trim(),
          termTh: termTh.trim(),
          category,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'บันทึกคำศัพท์ไม่สำเร็จ');
      }

      setTermEn('');
      setTermTh('');
      setSuccess(`บันทึกคำศัพท์ "${data.glossary.termEn}" สำเร็จ`);
      fetchGlossary();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(glossaryId: string, name: string) {
    if (!confirm(`คุณต้องการลบคำศัพท์ "${name}" หรือไม่?`)) return;

    try {
      const res = await fetch(`${endpoint}?glossaryId=${glossaryId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setGlossaries((prev) => prev.filter((g) => g.id !== glossaryId));
      } else {
        alert(data.error || 'ลบไม่สำเร็จ');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการลบ');
    }
  }

  const filtered = glossaries.filter(
    (g) =>
      g.termEn.toLowerCase().includes(search.toLowerCase()) ||
      g.termTh.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <BookMarked className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>{isFandom ? 'คำศัพท์ที่ใช้ร่วมกันใน Fandom' : 'พจนานุกรมคำศัพท์เฉพาะเรื่อง (Glossary)'}</span>
              <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-slate-800 text-amber-400 rounded-full border border-slate-700/60">
                {glossaries.length} คำ
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              กำหนดคำแปลชื่อตัวละครและศัพท์เฉพาะ เพื่อให้ AI ยึดตามนี้อย่างเคร่งครัด
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {canPromote && selected.size > 0 && (
            <button
              type="button"
              onClick={() => handlePromote([...selected])}
              disabled={promoting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-sky-500/10 text-sky-300 border border-sky-500/30 hover:bg-sky-500/20 disabled:opacity-50 transition-all shrink-0"
            >
              {promoting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpToLine className="w-3.5 h-3.5" />}
              <span>ย้าย {selected.size} คำไป fandom</span>
            </button>
          )}

          {isAdmin && !isFandom && (
            <button
              type="button"
              onClick={handleAutoExtract}
              disabled={extracting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-50 transition-all shrink-0"
              title="สแกนเนื้อหาภาษาอังกฤษของนิยายเรื่องนี้เพื่อตรวจจับชื่อเฉพาะและคำศัพท์โดยอัตโนมัติ"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังสแกน...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>สแกนคำศัพท์อัตโนมัติ</span>
                </>
              )}
            </button>
          )}

          {isAdmin && !isFandom && glossaries.length > 0 && (
            <button
              type="button"
              onClick={handleApplyAllToChapters}
              disabled={applyingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50 transition-all shrink-0"
              title="นำคำศัพท์ทั้งหมดไปสแกนและแทนที่ในเนื้อหาทุกตอนที่แปลแล้วโดยไม่ต้องแปลใหม่"
            >
              {applyingAll ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>กำลังแทนที่...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>แทนที่คำในเนื้อหาทุกตอน</span>
                </>
              )}
            </button>
          )}

          {/* Search */}
          <div className="relative w-full sm:w-56">
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

      {/* Admin Add Form */}
      {isAdmin && (
        <form onSubmit={handleAddTerm} className="p-4 bg-slate-950/70 border border-slate-800/80 rounded-2xl space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Plus className="w-4 h-4 text-amber-400" />
            <span>เพิ่มคำศัพท์ใหม่</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">คำศัพท์ภาษาอังกฤษ (EN)</label>
              <input
                type="text"
                value={termEn}
                onChange={(e) => setTermEn(e.target.value)}
                placeholder="เช่น Rose, Arthur, Young Master"
                required
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">คำแปลภาษาไทย (TH)</label>
              <input
                type="text"
                value={termTh}
                onChange={(e) => setTermTh(e.target.value)}
                placeholder="เช่น โรส, อาร์เธอร์, เสี่ยน้อย"
                required
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1">หมวดหมู่</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500/50 cursor-pointer"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {lang === 'en' ? c.labelEn : c.labelTh}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="p-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting || !termEn.trim() || !termTh.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>บันทึกคำศัพท์</span>
            </button>
          </div>
        </form>
      )}

      {/* Glossary Items List */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <span className="text-xs">กำลังโหลดคำศัพท์...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center space-y-2 bg-slate-950/40 rounded-2xl border border-slate-800/40">
          <BookMarked className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs text-slate-400">
            {search ? 'ไม่พบคำศัพท์ที่ตรงกับการค้นหา' : 'ยังไม่มีคำศัพท์เฉพาะเรื่อง'}
          </p>
          {isAdmin && !search && (
            <p className="text-[11px] text-slate-500">
              เพิ่มชื่อตัวละครหลักไว้ที่นี่ เพื่อให้ระบบแปลชื่อสม่ำเสมอทุกตอน
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filtered.map((item) => {
            const catInfo = CATEGORY_OPTIONS.find((c) => c.id === item.category);

            if (editingId === item.id) {
              return (
                <form
                  key={item.id}
                  onSubmit={handleSaveEdit}
                  className="p-3 bg-slate-900/90 border border-amber-500/50 rounded-xl space-y-2.5 shadow-lg"
                >
                  <div className="space-y-1.5">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">คำศัพท์อังกฤษ (EN)</label>
                      <input
                        type="text"
                        value={editTermEn}
                        onChange={(e) => setEditTermEn(e.target.value)}
                        required
                        className="w-full px-2.5 py-1 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">คำแปลไทย (TH)</label>
                      <input
                        type="text"
                        value={editTermTh}
                        onChange={(e) => setEditTermTh(e.target.value)}
                        required
                        className="w-full px-2.5 py-1 text-xs rounded-lg bg-slate-950 border border-slate-700 text-amber-400 font-semibold focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">หมวดหมู่</label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer"
                      >
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {lang === 'en' ? c.labelEn : c.labelTh}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!isFandom && (
                      <label className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={editApplyToChapters}
                          onChange={(e) => setEditApplyToChapters(e.target.checked)}
                          className="accent-amber-400 rounded cursor-pointer"
                        />
                        <span>แทนที่คำนี้ในทุกตอนทันที</span>
                      </label>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={editSaving}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={editSaving || !editTermEn.trim() || !editTermTh.trim()}
                      className="flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      <span>บันทึก</span>
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div
                key={item.id}
                className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-all flex items-start justify-between gap-2 group"
              >
                {canPromote && (
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    aria-label={`เลือก ${item.termEn}`}
                    className="mt-0.5 accent-sky-400 cursor-pointer"
                  />
                )}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-100 font-mono">{item.termEn}</span>
                    <span className="text-[10px] text-slate-500">→</span>
                    <span className="text-xs font-semibold text-amber-400">{item.termTh}</span>
                  </div>
                  {catInfo && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 bg-slate-900 rounded-md border border-slate-800">
                      <Tag className="w-2.5 h-2.5 text-amber-500/70" />
                      {lang === 'en' ? catInfo.labelEn : catInfo.labelTh}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-0.5">
                  {canPromote && (
                    <button
                      type="button"
                      disabled={promoting}
                      onClick={() => handlePromote([item.id])}
                      className="p-1 text-slate-500 hover:text-sky-300 hover:bg-sky-500/10 rounded-lg transition-colors opacity-60 group-hover:opacity-100 disabled:opacity-30"
                      title={`ย้ายไป fandom "${promoteToFandomName}"`}
                    >
                      <ArrowUpToLine className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => startEditing(item)}
                      className="p-1 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors opacity-60 group-hover:opacity-100"
                      title="แก้ไขคำศัพท์"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id, item.termEn)}
                      className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors opacity-60 group-hover:opacity-100"
                      title="ลบคำศัพท์"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
