'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert, X } from 'lucide-react';
import { useLanguage } from '@/lib/languageContext';

function AccessDeniedInner() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);

  const checkUnauthorized = useCallback(() => {
    if (typeof window === 'undefined') return false;

    // Check next/navigation searchParams
    const unauthParam = searchParams?.get('unauthorized');
    const errorParam = searchParams?.get('error');

    if (unauthParam === 'admin' || unauthParam === 'true' || unauthParam === '1' || errorParam === 'unauthorized_admin') {
      return true;
    }

    // Direct window.location fallback check
    const currentSearch = window.location.search;
    if (
      currentSearch.includes('unauthorized=admin') ||
      currentSearch.includes('unauthorized=1') ||
      currentSearch.includes('unauthorized=true') ||
      currentSearch.includes('error=unauthorized_admin')
    ) {
      return true;
    }

    return false;
  }, [searchParams]);

  useEffect(() => {
    if (checkUnauthorized()) {
      setIsOpen(true);
    }
  }, [checkUnauthorized]);

  // Support escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('unauthorized');
      url.searchParams.delete('error');
      const cleanPath = url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '');
      window.history.replaceState({}, '', cleanPath);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-sm sm:max-w-md p-6 sm:p-7 bg-slate-900 border border-rose-500/40 rounded-3xl shadow-2xl space-y-5 text-center animate-scale-up relative">
        {/* Close Button Top Right */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Warning Icon Badge */}
        <div className="inline-flex p-3.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 rounded-2xl shadow-inner shadow-rose-500/10">
          <ShieldAlert className="w-8 h-8 sm:w-9 sm:h-9" />
        </div>

        {/* Modal Content */}
        <div className="space-y-2">
          <h3 className="text-base sm:text-lg font-bold text-slate-100">
            {t('accessDeniedTitle')}
          </h3>
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl text-xs sm:text-sm text-slate-300 leading-relaxed break-words text-center">
            {t('accessDeniedMsg')}
          </div>
        </div>

        {/* Acknowledge Button */}
        <button
          type="button"
          onClick={handleClose}
          className="w-full py-2.5 px-4 text-xs sm:text-sm font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          {t('btnUnderstand')}
        </button>
      </div>
    </div>
  );
}

export default function AccessDeniedModal() {
  return (
    <React.Suspense fallback={null}>
      <AccessDeniedInner />
    </React.Suspense>
  );
}
