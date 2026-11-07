"use client";

import React, { useState } from "react";
import { AlertTriangle, X, Check } from "lucide-react";
import { closeContract } from "@/lib/api";

interface CloseContractModalProps {
  contractId: number;
  carName: string;
  driverName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CloseContractModal({
  contractId,
  carName,
  driverName,
  onClose,
  onSuccess,
}: CloseContractModalProps) {
  const [closeNote, setCloseNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await closeContract(contractId, {
        close_note: closeNote.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Shartnomani yopishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-full">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">Shartnomani yopish</h3>
              <p className="text-xs text-slate-500">Muddatidan oldin yakunlash</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleClose} className="p-5 space-y-4">
          <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 space-y-1">
            <p className="font-semibold">Diqqat!</p>
            <p>
              Ushbu shartnoma yopilgach, <b>{carName}</b> avtomobili bo'sh holatga qaytadi va to'lanmagan
              qolgan to'lovlar bekor qilinadi.
            </p>
            <p className="text-slate-600 pt-1">
              Haydovchi: <span className="font-medium text-slate-900">{driverName}</span>
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Yopilish sababi yoki izoh (ixtiyoriy)
            </label>
            <textarea
              rows={2}
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              placeholder="Masalan: Mashina muddatidan oldin qaytarildi / To'liq hisob-kitob qilindi"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {loading ? "Yopilmoqda..." : "Yopishni tasdiqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
