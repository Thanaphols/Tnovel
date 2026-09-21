'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Zap,
  Power,
  PowerOff,
  AlertCircle,
  Loader2,
  CheckCircle2,
  RefreshCw,
  HardDrive,
} from 'lucide-react';

interface OllamaStatus {
  online: boolean;
  modelLoaded: boolean;
  modelName: string;
  vramMB?: number;
  activeJobs?: number;
}

export default function OllamaStatusCard() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmForce, setConfirmForce] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ollama');
      const data = await res.json();
      if (data.success) {
        setStatus({
          online: data.online,
          modelLoaded: data.modelLoaded,
          modelName: data.modelName,
          vramMB: data.vramMB,
          activeJobs: data.activeJobs,
        });
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 30000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  async function handleToggle(action: 'connect' | 'disconnect', force = false) {
    setActionLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, force }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.draining) {
          setConfirmForce(true);
          setFeedback({ ok: false, message: data.message });
          return;
        }
        throw new Error(data.error || 'ดำเนินการไม่สำเร็จ');
      }

      setConfirmForce(false);
      setFeedback({ ok: true, message: data.message });
      await fetchStatus();
    } catch (err: any) {
      setFeedback({ ok: false, message: err.message });
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl shadow-lg relative overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Side: Info */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className={`p-3 rounded-2xl border flex-shrink-0 transition-colors ${
              !status?.online
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : status.modelLoaded
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            <Cpu className="w-6 h-6" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-100">
                สถานะการเชื่อมต่อ AI เกลาสำนวน (Ollama / Local LLM)
              </h3>
              <button
                type="button"
                onClick={fetchStatus}
                disabled={loading}
                className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                title="รีเฟรชสถานะ"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loading ? (
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                <span>กำลังตรวจสอบสถานะการเชื่อมต่อ...</span>
              </p>
            ) : !status?.online ? (
              <p className="text-xs text-rose-400 flex items-center gap-1.5 mt-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Ollama ไม่ได้ทำงานอยู่ในเครื่อง (กรุณาเปิดโปรแกรม Ollama)</span>
              </p>
            ) : status.modelLoaded ? (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>พร้อมใช้งานบน VRAM</span>
                </span>
                <span className="text-xs text-slate-300 font-mono font-medium">
                  โมเดล: <strong className="text-amber-300">{status.modelName}</strong>
                </span>
                {status.vramMB ? (
                  <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-slate-500" />
                    <span>{(status.vramMB / 1024).toFixed(1)} GB VRAM</span>
                  </span>
                ) : null}
                {(status.activeJobs || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                    ⚡ มีงานค้างอยู่ {status.activeJobs} งาน
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs text-amber-400 flex items-center gap-1.5 mt-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>
                  Ollama พร้อมใช้งาน แต่โมเดล{' '}
                  <strong className="font-mono text-slate-200">{status.modelName}</strong> ยังไม่ได้โหลดลงการ์ดจอ (VRAM)
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Actions */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {status?.online && (
            <>
              {status.modelLoaded ? (
                confirmForce ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleToggle('disconnect', true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md transition-all active:scale-95"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PowerOff className="w-3.5 h-3.5" />}
                      <span>ยืนยันบังคับตัด</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmForce(false)}
                      className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                    >
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleToggle('disconnect', false)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-200 hover:text-rose-300 bg-slate-950 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-500/40 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PowerOff className="w-3.5 h-3.5 text-rose-400" />}
                    <span>ตัดการเชื่อมต่อ (คืน VRAM)</span>
                  </button>
                )
              ) : (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleToggle('connect')}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-md shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                  <span>เชื่อมต่อโมเดลเข้า VRAM</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Feedback Message */}
      {feedback && (
        <div
          className={`mt-3 p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
            feedback.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          {feedback.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
