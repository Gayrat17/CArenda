"use client";

import React, { useState } from "react";
import { X, DollarSign, CheckCircle2 } from "lucide-react";
import { recordPayment } from "@/lib/api";
import { formatUSD } from "@/lib/utils";

interface PaymentTarget {
  id: number;
  contract_id?: number;
  month_number?: number;
  due_date: string;
  expected_amount: string;
  paid_amount: string;
  remaining_amount: string;
  car_name?: string;
  driver_name?: string;
}

interface PaymentModalProps {
  payment: PaymentTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentModal({ payment, onClose, onSuccess }: PaymentModalProps) {
  const [amount, setAmount] = useState(payment ? payment.remaining_amount : "");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!payment) return null;

  const remaining = parseFloat(payment.remaining_amount) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payVal = parseFloat(amount);
    if (isNaN(payVal) || payVal <= 0) {
      setError("Iltimos, to'g'ri to'lov summasini kiriting.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await recordPayment(payment.id, {
        amount: payVal,
        comment,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "To'lovni qabul qilishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-full">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">To'lov qabul qilish</h3>
              <p className="text-xs text-slate-500">
                {payment.month_number ? `${payment.month_number}-oy to'lovi` : "Ijara to'lovi"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-xl">
              {error}
            </div>
          )}

          {/* Payment summary box */}
          <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs">
            {payment.car_name && (
              <div className="flex justify-between">
                <span className="text-slate-500">Mashina:</span>
                <span className="font-medium text-slate-900">{payment.car_name}</span>
              </div>
            )}
            {payment.driver_name && (
              <div className="flex justify-between">
                <span className="text-slate-500">Haydovchi:</span>
                <span className="font-medium text-slate-900">{payment.driver_name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Oylik to'lov summasi:</span>
              <span className="font-medium text-slate-900">{formatUSD(payment.expected_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">To'langan:</span>
              <span className="font-medium text-emerald-600">{formatUSD(payment.paid_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200/80 pt-1.5 font-semibold">
              <span className="text-slate-700">Qolgan summa:</span>
              <span className="text-rose-600 text-sm">{formatUSD(payment.remaining_amount)}</span>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              To'lanayotgan summa ($ USD) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 text-base font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            {/* Quick preset buttons */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setAmount(remaining.toFixed(2))}
                className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition"
              >
                To'liq: {formatUSD(remaining)}
              </button>
              {remaining > 100 && (
                <button
                  type="button"
                  onClick={() => setAmount((remaining / 2).toFixed(2))}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition"
                >
                  50%: {formatUSD(remaining / 2)}
                </button>
              )}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Izoh (ixtiyoriy)
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Masalan: Naqd berildi / Karta orqali"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Action buttons */}
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
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? "Saqlanmoqda..." : "Tasdiqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
