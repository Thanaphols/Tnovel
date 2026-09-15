'use client';

import React from 'react';
import { X, Type, Sun, Moon, Palette, AlignLeft, Languages, RefreshCw, AlertCircle, Loader2, Sparkles, Bookmark } from 'lucide-react';
import { ReaderSettingsState } from '@/lib/db';
import { useLanguage } from '@/lib/languageContext';

interface ReaderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettingsState;
  onUpdateSettings: (newSettings: Partial<ReaderSettingsState>) => void;
  onRetranslate?: (engine: 'google' | 'gemini') => void;
  isRetranslating?: boolean;
  onOpenReport?: () => void;
  onToggleBookmark?: () => void;
  isBookmarked?: boolean;
}

export default function ReaderSettings({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onRetranslate,
  isRetranslating,
  onOpenReport,
  onToggleBookmark,
  isBookmarked = false,
}: ReaderSettingsProps) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in cursor-pointer sm:cursor-default"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl space-y-6 cursor-default"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800/50 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <Type className="w-5 h-5 text-amber-400" />
          <h3 className="text-base font-bold text-slate-100">{t('readerSettingsTitle')}</h3>
        </div>

        {/* 1. Language Toggle */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Languages className="w-3.5 h-3.5 text-amber-400" /> {t('displayModeLabel')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'th', label: t('modeThLabel') },
              { id: 'en', label: t('modeEnLabel') },
              { id: 'parallel', label: t('modeParallelLabel') },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => onUpdateSettings({ displayMode: mode.id as any })}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all ${
                  settings.displayMode === mode.id
                    ? 'text-amber-300 bg-amber-500/20 border-amber-500/50 shadow-sm'
                    : 'text-slate-400 bg-slate-950 border-slate-800 hover:text-slate-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Theme Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Palette className="w-3.5 h-3.5 text-amber-400" /> {t('themeColorLabel')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'light', label: t('themeLightLabel'), bg: 'bg-[#fbf9f5]', text: 'text-stone-900' },
              { id: 'sepia', label: t('themeSepiaLabel'), bg: 'bg-[#f4ecd8]', text: 'text-amber-950' },
              { id: 'dark', label: t('themeDarkLabel'), bg: 'bg-[#0b0f19]', text: 'text-slate-100' },
            ].map((theme) => (
              <button
                key={theme.id}
                onClick={() => onUpdateSettings({ theme: theme.id as any })}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold rounded-xl border transition-all ${theme.bg} ${theme.text} ${
                  settings.theme === theme.id
                    ? 'ring-2 ring-amber-500 border-amber-500 shadow-md'
                    : 'border-slate-800 opacity-80 hover:opacity-100'
                }`}
              >
                {theme.id === 'light' && <Sun className="w-3.5 h-3.5 text-amber-600" />}
                {theme.id === 'sepia' && <Palette className="w-3.5 h-3.5 text-amber-800" />}
                {theme.id === 'dark' && <Moon className="w-3.5 h-3.5 text-slate-400" />}
                <span>{theme.label.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Font Size */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Type className="w-3.5 h-3.5 text-amber-400" /> {t('fontSizeLabel')}
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'sm', label: t('fontSm') },
              { id: 'md', label: t('fontMd') },
              { id: 'lg', label: t('fontLg') },
              { id: 'xl', label: t('fontXl') },
            ].map((size) => (
              <button
                key={size.id}
                onClick={() => onUpdateSettings({ fontSize: size.id as any })}
                className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all ${
                  settings.fontSize === size.id
                    ? 'text-amber-300 bg-amber-500/20 border-amber-500/50 shadow-sm'
                    : 'text-slate-400 bg-slate-950 border-slate-800 hover:text-slate-200'
                }`}
              >
                {size.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Font Family */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <AlignLeft className="w-3.5 h-3.5 text-amber-400" /> {t('fontFamilyLabel')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'sans', label: t('fontSans') },
              { id: 'serif', label: t('fontSerif') },
            ].map((font) => (
              <button
                key={font.id}
                onClick={() => onUpdateSettings({ fontFamily: font.id as any })}
                className={`py-2.5 px-3 text-xs font-semibold rounded-xl border transition-all ${
                  settings.fontFamily === font.id
                    ? 'text-amber-300 bg-amber-500/20 border-amber-500/50 shadow-sm'
                    : 'text-slate-400 bg-slate-950 border-slate-800 hover:text-slate-200'
                }`}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Chapter Tools: Re-translate & Report Issue */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" /> {t('chapterToolsLabel')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={isRetranslating}
              onClick={() => {
                if (onRetranslate) {
                  onRetranslate('google');
                  onClose();
                }
              }}
              className="flex flex-col items-start p-3 rounded-2xl border border-slate-800 bg-slate-950 hover:bg-slate-800/80 transition-all text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                {isRetranslating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{t('retranslateGoogle')}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5">{t('retranslateGoogleDesc')}</span>
            </button>

            <button
              disabled={isRetranslating}
              onClick={() => {
                if (onRetranslate) {
                  onRetranslate('gemini');
                  onClose();
                }
              }}
              className="flex flex-col items-start p-3 rounded-2xl border border-slate-800 bg-slate-950 hover:bg-slate-800/80 transition-all text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                {isRetranslating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>{t('retranslateGemini')}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5">{t('retranslateGeminiDesc')}</span>
            </button>
          </div>

          {/* Bookmark Current Chapter Button */}
          <button
            onClick={() => {
              if (onToggleBookmark) {
                onToggleBookmark();
              }
            }}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-2xl border transition-all ${
              isBookmarked
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                : 'border-slate-800 bg-slate-950 hover:bg-slate-800/80 text-slate-200'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400 text-amber-400' : 'text-amber-400'}`} />
            <span>{isBookmarked ? t('bookmarkedCurrentChapter') : t('bookmarkCurrentChapter')}</span>
          </button>

          {/* Report Issue Button */}
          <button
            onClick={() => {
              if (onOpenReport) {
                onClose();
                onOpenReport();
              }
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-2xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
          >
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <span>{t('reportChapterIssue')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
