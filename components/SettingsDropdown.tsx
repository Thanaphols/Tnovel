'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Settings, Sun, Moon, Sparkles } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';
import { useAppTheme, AppTheme } from '@/lib/themeContext';

export default function SettingsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { lang, setLang, t } = useLanguage();
  const { theme, setTheme } = useAppTheme();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Gear Icon Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group flex items-center justify-center p-2 rounded-xl border transition-all ${
          isOpen
            ? 'bg-slate-800 text-amber-400 border-amber-500/40 shadow-sm'
            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border-slate-800'
        }`}
        title="การตั้งค่า (ธีม และ ภาษา)"
        aria-expanded={isOpen}
      >
        <Settings
          className={`w-4 h-4 transition-transform duration-300 ${
            isOpen ? 'rotate-90 text-amber-400' : 'group-hover:rotate-45'
          }`}
        />
      </button>

      {/* Settings Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-3 z-50 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
          {/* Theme Section */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 px-1 block">
              {lang === 'th' ? 'ธีมการแสดงผล' : 'Display Theme'}
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all ${
                  theme === 'light'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('themeLight')}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>{lang === 'th' ? 'สว่าง' : 'Light'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all ${
                  theme === 'dark'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('themeDark')}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>{lang === 'th' ? 'มืด' : 'Dark'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTheme('sepia')}
                className={`flex items-center justify-center gap-1 py-1.5 px-2 text-[11px] font-bold rounded-lg transition-all ${
                  theme === 'sepia'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={t('themeSepia')}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{lang === 'th' ? 'ถนอม' : 'Sepia'}</span>
              </button>
            </div>
          </div>

          {/* Language Section - No language icon, just TH and ENG as requested */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 px-1 block">
              {lang === 'th' ? 'ภาษา' : 'Language'}
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setLang('th')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all text-center ${
                  lang === 'th'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                TH
              </button>

              <button
                type="button"
                onClick={() => setLang('en')}
                className={`py-1.5 px-3 text-xs font-bold rounded-lg transition-all text-center ${
                  lang === 'en'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ENG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
