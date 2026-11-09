"use client";

import React, { useState } from "react";
import {
  X,
  CreditCard,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Clock,
  Sparkles,
} from "lucide-react";
import { PaymentSettings } from "@/types/subscription";
import { createSubscriptionRequest } from "@/lib/api";

interface SubscriptionPaymentModalProps {
  planType: "standard" | "pro";
  planName: string;
  planPrice: number;
  paymentSettings: PaymentSettings | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function SubscriptionPaymentModal({
  planType,
  planName,
  planPrice,
  paymentSettings,
  onClose,
  onSuccess,
}: SubscriptionPaymentModalProps) {
  const [copiedCard, setCopiedCard] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formattedPrice = planPrice.toLocaleString("uz-UZ");

  const paynetUrl =
    paymentSettings?.paynet_url ||
    process.env.NEXT_PUBLIC_PAYNET_P2P_URL ||
    "";
  const clickUrl = process.env.NEXT_PUBLIC_CLICK_P2P_URL || "";
  const paymeUrl = process.env.NEXT_PUBLIC_PAYME_P2P_URL || "";

  const cardNumber =
    paymentSettings?.card_number ||
    process.env.NEXT_PUBLIC_ADMIN_CARD_NUMBER ||
    "";
  const cardHolder =
    paymentSettings?.card_holder ||
    process.env.NEXT_PUBLIC_ADMIN_CARD_HOLDER ||
    "";
  const qrImage = paymentSettings?.paynet_qr_image || "";

  const handleCopyCard = async () => {
    if (!cardNumber) return;
    try {
      await navigator.clipboard.writeText(cardNumber.replace(/\s+/g, ""));
      setCopiedCard(true);
      setTimeout(() => setCopiedCard(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleOpenLink = (url: string) => {
    if (!url) return;
    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : null;
    if (typeof tg?.openLink === "function") {
      tg.openLink(url);
    } else {
      window.open(url, "_blank");
    }
  };

  const handleConfirmPayment = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await createSubscriptionRequest({
        plan_type: planType,
        amount: planPrice,
        note: note.trim(),
      });
      onSuccess();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "To'lov so'rovini yuborishda xatolik yuz berdi."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-6 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {planName} Tarifiga Obuna
              </h3>
              <p className="text-xs text-blue-600 font-semibold">
                {formattedPrice} UZS / oy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Paynet Button */}
          {paynetUrl && (
            <button
              onClick={() => handleOpenLink(paynetUrl)}
              className="w-full flex items-center justify-between p-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-2xl shadow-xs transition cursor-pointer font-semibold text-xs"
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4" />
                <span>💳 Paynet orqali to'lash</span>
              </div>
              <ExternalLink className="w-4 h-4 opacity-80" />
            </button>
          )}

          {/* Additional Quick P2P Buttons if configured in env */}
          {(clickUrl || paymeUrl) && (
            <div className="grid grid-cols-2 gap-2">
              {clickUrl && (
                <button
                  type="button"
                  onClick={() => handleOpenLink(clickUrl)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-xl text-xs font-semibold transition"
                >
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                  <span>Click orqali</span>
                </button>
              )}
              {paymeUrl && (
                <button
                  type="button"
                  onClick={() => handleOpenLink(paymeUrl)}
                  className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200/80 rounded-xl text-xs font-semibold transition"
                >
                  <CreditCard className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Payme orqali</span>
                </button>
              )}
            </div>
          )}

          {/* Paynet QR Code Section if available */}
          {qrImage && (
            <div className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl flex flex-col items-center justify-center text-center space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>Paynet QR-kod orqali to'lash</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrImage}
                alt="Paynet QR Code"
                className="w-44 h-44 object-contain rounded-xl border border-slate-200 bg-white p-2 shadow-2xs"
              />
              <p className="text-[11px] text-slate-500">
                Paynet ilovasidan skanerlang va to'lovni tasdiqlang
              </p>
            </div>
          )}

          {/* Fallback Plastic Card Box */}
          {cardNumber && (
            <div className="p-3.5 bg-slate-900 text-white rounded-2xl space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>To'lov kartasi (Humo / UzCard)</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="flex items-center justify-between bg-white/10 px-3 py-2 rounded-xl">
                <span className="font-mono text-sm tracking-widest font-bold">
                  {cardNumber}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCard}
                  className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition active:scale-95 cursor-pointer text-xs flex items-center gap-1"
                >
                  {copiedCard ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span className="text-[10px] text-emerald-300 font-semibold">Nusxalandi</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-white" />
                      <span className="text-[10px] text-white font-semibold">Nusxalash</span>
                    </>
                  )}
                </button>
              </div>

              {cardHolder && (
                <div className="flex items-center justify-between text-xs text-slate-300 pt-0.5">
                  <span className="text-[10px] text-slate-400">Karta egasi:</span>
                  <span className="font-semibold uppercase tracking-wide">
                    {cardHolder}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Optional Note / Transaction receipt */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700">
              Tranzaksiya raqami yoki izoh (ixtiyoriy)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan: Paynet chek raqami yoki telefoningiz"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="p-3 bg-amber-50/80 border border-amber-200/80 text-amber-800 text-[11px] rounded-xl flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              To'lovni amalga oshirgach, pastdagi <b>"To'lov qildim"</b> tugmasini bosing. Admin to'lovni tekshirib, obunangizni 30 kunga faollashtiradi.
            </span>
          </div>

          {/* Primary Confirm Button */}
          <button
            onClick={handleConfirmPayment}
            disabled={submitting}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Yuborilmoqda...</span>
              </>
            ) : (
              <span>✅ To'lov qildim (Tasdiqlash)</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
