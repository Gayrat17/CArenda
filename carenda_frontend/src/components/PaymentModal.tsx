"use client";

import React, { useState } from "react";
import { X, DollarSign, CheckCircle2, Calendar, AlertTriangle, Clock } from "lucide-react";
import { recordPayment, postponePayment } from "@/lib/api";
import { formatUSD, formatMoneyInput, parseMoneyValue } from "@/lib/utils";

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
  comment?: string;
  is_postponed?: boolean;
}

interface PaymentModalProps {
  payment: PaymentTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentModal({ payment, onClose, onSuccess }: PaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState(payment?.comment || "");
  const [loading, setLoading] = useState(false);
  const [postponing, setPostponing] = useState(false);
  const [confirmPostpone, setConfirmPostpone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!payment) return null;

  const remaining = parseFloat(payment.remaining_amount) || 0;
  const payVal = parseMoneyValue(amount);
  const isAmountValid = !isNaN(payVal) && payVal > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAmountValid) {
      setError("Iltimos, to'g'ri to'lov summasini kiriting.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await recordPayment(payment.id, {
        amount: payVal,
        comment: comment.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "To'lovni qabul qilishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  const handlePostpone = async () => {
    try {
      setPostponing(true);
      setError(null);
      await postponePayment(payment.id, comment.trim());
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "To'lovni surishda xatolik yuz berdi.");
      setConfirmPostpone(false);
    } finally {
      setPostponing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl max-h-[92dvh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-full">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">To&apos;lov qabul qilish</h3>
              <p className="text-xs text-slate-500">
                {payment.month_number ? `${payment.month_number}-oy to'lovi` : "Ijara to'lovi"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
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
                <span className="font-medium text-slate-900 capitalize">{payment.driver_name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Oylik to&apos;lov summasi:</span>
              <span className="font-medium text-slate-900">{formatUSD(payment.expected_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">To&apos;langan:</span>
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
              To&apos;lanayotgan summa ($ USD) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
                className="w-full pl-8 pr-4 py-2.5 text-base font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-slate-300"
              />
            </div>
            {/* Quick preset buttons */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setAmount(formatMoneyInput(remaining.toFixed(2)))}
                className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition cursor-pointer"
              >
                To&apos;liq: {formatUSD(remaining)}
              </button>
              {remaining > 100 && (
                <button
                  type="button"
                  onClick={() => setAmount(formatMoneyInput((remaining / 2).toFixed(2)))}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                >
                  50%: {formatUSD(remaining / 2)}
                </button>
              )}
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Izoh
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Masalan: Naqd berildi / Karta orqali"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-slate-400"
            />
          </div>

          {/* Postpone Schedule Action */}
          <div className="pt-1">
            {payment.is_postponed || payment.comment?.includes("[1 oyga surildi]") ? (
              <div className="w-full py-2.5 px-3.5 bg-slate-100 border border-slate-200 text-slate-500 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 cursor-not-allowed select-none">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>⚠️ Ushbu oy to&apos;lovi allaqachon 1 marta surilgan</span>
              </div>
            ) : !confirmPostpone ? (
              <button
                type="button"
                onClick={() => setConfirmPostpone(true)}
                disabled={loading || postponing}
                className="w-full py-2.5 px-3.5 bg-amber-50 hover:bg-amber-100 active:scale-98 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Calendar className="w-4 h-4 text-amber-600" />
                📅 To&apos;lovni 1 oy keyinga surish (1 martalik)
              </button>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">
                    Ushbu oy va undan keyingi barcha to&apos;lanmagan oylar sanasi 1 oy keyinga suriladi. Har bir oy to&apos;lovini faqat bir marta surish mumkin. Tasdiqlaysizmi?
                  </p>
                </div>
                {comment.trim() && (
                  <p className="text-[11px] text-amber-800 bg-amber-100/70 border border-amber-200 rounded-lg p-2 leading-tight">
                    <span className="font-semibold">Biriktiriladigan izoh:</span> {comment.trim()}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handlePostpone}
                    disabled={postponing}
                    className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-semibold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {postponing ? "Surilmoqda..." : "Ha, 1 oyga surilsin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPostpone(false)}
                    disabled={postponing}
                    className="py-2 px-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95 rounded-lg text-xs font-medium transition cursor-pointer"
                  >
                    Bekor qilish
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading || postponing}
              className="flex-1 py-2.5 px-4 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading || postponing || confirmPostpone || !isAmountValid}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
