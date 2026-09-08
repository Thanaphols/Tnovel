'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, BookOpen, Search, Check, Sparkles } from 'lucide-react';

interface ChapterItem {
  id: string;
  chapterNumber: number;
  titleTh: string;
  titleEn?: string;
}

interface ChapterListDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  novelTitle: string;
  currentChapterId: string;
  chapters: ChapterItem[];
  theme?: 'dark' | 'sepia' | 'light';
}

export default function ChapterListDrawer({
  isOpen,
  onClose,
  novelTitle,
  currentChapterId,
  chapters = [],
  theme = 'dark',
}: ChapterListDrawerProps) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = chapters.filter((c) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      c.chapterNumber.toString().includes(query) ||
      (c.titleTh && c.titleTh.toLowerCase().includes(query)) ||
      (c.titleEn && c.titleEn.toLowerCase().includes(query))
    );
  });

  const themeClasses = {
    dark: {
      drawer: 'bg-slate-900/95 border-slate-800 text-slate-100',
      item: 'hover:bg-slate-800/80 text-slate-300 hover:text-slate-100',
      activeItem: 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold',
      search: 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-amber-500/50',
      counter: 'bg-slate-800 text-slate-400',
    },
    sepia: {
      drawer: 'bg-[#ede2c8]/95 border-[#dacdb0] text-[#433422]',
      item: 'hover:bg-[#dfd3b9] text-[#5c462e] hover:text-[#2d2215]',
      activeItem: 'bg-[#c88d46]/20 border-[#c88d46]/50 text-[#8c571e] font-bold',
      search: 'bg-[#f4ecd8] border-[#dacdb0] text-[#433422] placeholder:text-[#8c7860] focus:border-[#c88d46]',
      counter: 'bg-[#dfd3b9] text-[#7a644c]',
    },
    light: {
      drawer: 'bg-white/95 border-stone-200 text-stone-900',
      item: 'hover:bg-stone-100 text-stone-700 hover:text-stone-950',
      activeItem: 'bg-amber-500/10 border-amber-500/30 text-amber-700 font-bold',
      search: 'bg-stone-50 border-stone-200 text-stone-900 placeholder:text-stone-400 focus:border-amber-500',
      counter: 'bg-stone-100 text-stone-500',
    },
  }[theme] || {
    drawer: 'bg-slate-900 border-slate-800 text-slate-100',
    item: 'hover:bg-slate-800 text-slate-300',
    activeItem: 'bg-amber-500/15 text-amber-300 font-bold',
    search: 'bg-slate-950 border-slate-800 text-slate-100',
    counter: 'bg-slate-800 text-slate-400',
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg max-h-[85vh] sm:max-h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden backdrop-blur-xl ${themeClasses.drawer}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-inherit flex items-center justify-between gap-3 flex-shrink-0">
          <div className="space-y-1 truncate">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <h3 className="text-sm sm:text-base font-bold truncate">สารบัญบทนิยาย</h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${themeClasses.counter}`}>
                {chapters.length} ตอน
              </span>
            </div>
            <p className="text-xs opacity-75 truncate">{novelTitle}</p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-black/10 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 sm:p-4 border-b border-inherit flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 opacity-50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาตามเลขตอน หรือชื่อบท..."
              className={`w-full pl-9 pr-4 py-2 text-xs rounded-xl border focus:outline-none transition-all ${themeClasses.search}`}
            />
          </div>
        </div>

        {/* Chapter List Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs opacity-60">
              {search ? 'ไม่พบบทนิยายที่ค้นหา' : 'ยังไม่มีบทนิยายในระบบ'}
            </div>
          ) : (
            filtered.map((chap) => {
              const isCurrent = chap.id === currentChapterId;

              return (
                <Link
                  key={chap.id}
                  href={`/reader/${chap.id}`}
                  onClick={onClose}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs border transition-all ${
                    isCurrent
                      ? themeClasses.activeItem
                      : `border-transparent ${themeClasses.item}`
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="font-mono text-[11px] opacity-70 flex-shrink-0">
                      #{chap.chapterNumber}
                    </span>
                    <span className="truncate">{chap.titleTh || `ตอนที่ ${chap.chapterNumber}`}</span>
                  </div>

                  {isCurrent && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold flex-shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      <span>กำลังอ่าน</span>
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
