'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { registerDialogHost, type DialogRequest } from '@/lib/dialog';
import { useLanguage } from '@/lib/languageContext';

// Renders confirmDialog()/alertDialog() requests one at a time, styled like ConfirmDeleteModal.
export default function DialogHost() {
  const { t } = useLanguage();
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue[0];

  useEffect(() => {
    registerDialogHost((req) => setQueue((q) => [...q, req]));
    return () => registerDialogHost(null);
  }, []);

  function close(ok: boolean) {
    current?.resolve(ok);
    setQueue((q) => q.slice(1));
  }

  useEffect(() => {
    if (!current) return;
    // Enter is handled natively by the autofocused confirm button.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!current) return null;
  const isConfirm = current.kind === 'confirm';
  const Icon = isConfirm || current.danger ? AlertTriangle : Info;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && close(false)}
      className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in"
    >
      <div
        role={isConfirm ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        className="relative w-full max-w-md p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl space-y-4"
      >
        <button
          type="button"
          onClick={() => close(false)}
          aria-label="ปิด"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pr-8">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 shrink-0">
            <Icon className="w-6 h-6" />
          </div>
          <h3 id="app-dialog-title" className="text-lg font-semibold text-slate-100">
            {current.title || (isConfirm ? 'ยืนยันการทำรายการ' : 'แจ้งเตือน')}
          </h3>
        </div>

        <p
          id="app-dialog-message"
          className="text-sm text-slate-300 leading-relaxed whitespace-pre-line bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80"
        >
          {current.message}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          {isConfirm && (
            <button
              type="button"
              onClick={() => close(false)}
              className="px-4 py-2.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
            >
              {t('cancel')}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={`px-4 py-2.5 text-xs font-medium rounded-xl active:scale-95 transition-all ${
              current.danger
                ? 'text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/20'
                : 'text-slate-950 bg-amber-500 hover:bg-amber-400'
            }`}
          >
            {current.confirmLabel || (isConfirm ? 'ยืนยัน' : 'ตกลง')}
          </button>
        </div>
      </div>
    </div>
  );
}
