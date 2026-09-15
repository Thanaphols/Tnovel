'use client';

import React from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDeleteModal({
  isOpen,
  title,
  message,
  confirmLabel,
  isLoading = false,
  onConfirm,
  onClose,
}: ConfirmDeleteModalProps) {
  const { t } = useLanguage();

  const finalTitle = title || t('confirmModalSoftDeleteTitle');
  const finalMessage = message || t('confirmModalSoftDeleteMsg');
  const finalConfirmLabel = confirmLabel || t('moveToBin');

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in cursor-pointer sm:cursor-default"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl space-y-4 cursor-default"
      >
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">{finalTitle}</h3>
            <p className="text-xs text-slate-400">{t('confirmModalSoftDeleteNote')}</p>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80">
          {finalMessage}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 active:scale-95 rounded-xl shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {finalConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
