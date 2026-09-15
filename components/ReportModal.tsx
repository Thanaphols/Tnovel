'use client';

import React, { useState, useMemo } from 'react';
import { AlertCircle, X, CheckCircle2, Loader2, Send, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  novelId?: string;
  chapterId?: string;
  title?: string;
}

export default function ReportModal({ isOpen, onClose, novelId, chapterId, title }: ReportModalProps) {
  const { t } = useLanguage();

  const reportReasons = useMemo(() => [
    t('reportReason1'),
    t('reportReason2'),
    t('reportReason3'),
    t('reportReason4'),
    t('reportReason5'),
  ], [t]);

  const [selectedReason, setSelectedReason] = useState(reportReasons[0]);
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novelId,
          chapterId,
          reason: selectedReason,
          description,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          setDescription('');
          onClose();
        }, 1800);
      } else {
        setError(data.error || t('reportErrorDefault'));
      }
    } catch (err: any) {
      setError(t('networkError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in cursor-pointer sm:cursor-default"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 cursor-default"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100">{t('reportModalTitle')}</h3>
            <p className="text-xs text-slate-400 line-clamp-1">{title || t('reportModalSub')}</p>
          </div>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-sm font-bold text-slate-100">{t('reportSuccessTitle')}</h4>
            <p className="text-xs text-slate-400">{t('reportSuccessDesc')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            {error && (
              <div className="p-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                {error}
              </div>
            )}

            {/* Reasons Custom Dropdown (No native OS select overflow) */}
            <div className="space-y-1.5 relative">
              <label className="text-xs font-semibold text-slate-300">{t('reportReasonLabel')}</label>
              <button
                type="button"
                onClick={() => setIsReasonOpen((prev) => !prev)}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 flex items-center justify-between focus:outline-none focus:border-amber-500/60 transition-all text-left"
              >
                <span className="truncate pr-2">{selectedReason || reportReasons[0]}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isReasonOpen ? 'rotate-180 text-amber-400' : ''}`} />
              </button>

              {isReasonOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsReasonOpen(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-1.5 space-y-1 animate-fade-in max-h-52 overflow-y-auto">
                    {reportReasons.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setSelectedReason(r);
                          setIsReasonOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all flex items-center justify-between ${
                          (selectedReason || reportReasons[0]) === r
                            ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{r}</span>
                        {(selectedReason || reportReasons[0]) === r && <span className="text-[10px] text-amber-400 shrink-0 ml-1">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Description Textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">{t('reportDescLabel')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder={t('reportDescPlaceholder')}
                className="w-full p-3 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-rose-400 hover:bg-rose-300 active:scale-95 rounded-xl transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('reportSending')}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('reportSubmit')}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
