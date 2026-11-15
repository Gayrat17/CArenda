"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Settings,
  CreditCard,
  QrCode,
  Upload,
  Save,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  Clock,
  Car,
} from "lucide-react";
import { getSuperadminSettings, updateSuperadminSettings } from "@/lib/api";

export default function SuperadminSettingsPage() {
  const [standartPrice, setStandartPrice] = useState("150000");
  const [freeDurationDays, setFreeDurationDays] = useState("60");
  const [freeMaxContracts, setFreeMaxContracts] = useState("3");
  const [paynetUrl, setPaynetUrl] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [supportTelegram, setSupportTelegram] = useState("");
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const s = await getSuperadminSettings();
      if (s) {
        setStandartPrice(String(s.standart_price || s.standard_plan_price || 150000));
        setFreeDurationDays(String(s.free_duration_days || 60));
        setFreeMaxContracts(String(s.free_max_contracts || 3));
        setPaynetUrl(s.paynet_url || "");
        setCardNumber(s.card_number || "");
        setCardHolder(s.card_holder || "");
        setSupportTelegram(s.support_telegram || "");
        setQrPreviewUrl(s.paynet_qr_image || null);
      }
    } catch (err: unknown) {
      showToast("error", "Sozlamalarni yuklashda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("standart_price", standartPrice.trim());
      formData.append("free_duration_days", freeDurationDays.trim());
      formData.append("free_max_contracts", freeMaxContracts.trim());
      formData.append("paynet_url", paynetUrl.trim());
      formData.append("card_number", cardNumber.trim());
      formData.append("card_holder", cardHolder.trim());
      formData.append("support_telegram", supportTelegram.trim());
      if (qrFile) {
        formData.append("paynet_qr_image", qrFile);
      }

      const updated = await updateSuperadminSettings(formData);
      if (updated.paynet_qr_image) {
        setQrPreviewUrl(updated.paynet_qr_image);
      }
      setQrFile(null);
      showToast("success", "Tarif va to'lov sozlamalari muvaffaqiyatli saqlandi!");
    } catch (err: unknown) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Sozlamalarni saqlashda xatolik yuz berdi."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded-xl" />
        <div className="h-96 bg-slate-900 rounded-3xl border border-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between border shadow-lg animate-in fade-in duration-200 ${
            toast.type === "success"
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-800"
              : "bg-rose-950/90 text-rose-300 border-rose-800"
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Tarif va To&apos;lov Sozlamalari</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Platformaning obuna narxlari, bepul limitlar va to&apos;lov rekvizitlari
          </p>
        </div>

        <button
          type="button"
          onClick={loadSettings}
          className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition active:scale-95 cursor-pointer"
          title="Qayta yuklash"
        >
          <RefreshCw className="w-4 h-4 text-amber-400" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* SECTION 1: Tariffs & Limits */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Settings className="w-4 h-4 text-amber-400" />
            <h2 className="font-bold text-sm text-white">Tarif va Limit Parametrlari</h2>
          </div>

          <div className="space-y-3">
            {/* Standart Price */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Standart Tarif Narxi (UZS / oy)
              </label>
              <input
                type="number"
                required
                min="0"
                step="1000"
                value={standartPrice}
                onChange={(e) => setStandartPrice(e.target.value)}
                placeholder="150000"
                className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-hidden focus:border-amber-500/60 transition"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Arendatorlar har oy ushbu summani to&apos;lab cheksiz mashina va shartnomalar qo&apos;shadilar.
              </span>
            </div>

            {/* Free Limits Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Bepul sinov davri (kunlar)</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="365"
                  value={freeDurationDays}
                  onChange={(e) => setFreeDurationDays(e.target.value)}
                  placeholder="60"
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-hidden focus:border-amber-500/60 transition"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  Yangi ro&apos;yxatdan o&apos;tgan arendatorga beriladigan bepul kunlar (standart: 60 kun / 2 oy).
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Free tarif mashina limiti (dona)</span>
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="100"
                  value={freeMaxContracts}
                  onChange={(e) => setFreeMaxContracts(e.target.value)}
                  placeholder="3"
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-hidden focus:border-amber-500/60 transition"
                />
                <span className="text-[10px] text-slate-500 block mt-1">
                  Free sinovdagi arendator qo&apos;sha oladigan maksimal avtomobillar soni (standart: 3 ta).
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Payment Requisites & Links */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <h2 className="font-bold text-sm text-white">To&apos;lov Rekvizitlari va Havolalar</h2>
          </div>

          <div className="space-y-3">
            {/* Paynet URL */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Paynet To&apos;lov Havolasi (P2P / QR URL)
              </label>
              <input
                type="url"
                value={paynetUrl}
                onChange={(e) => setPaynetUrl(e.target.value)}
                placeholder="https://paynet.uz/p2p/..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-hidden focus:border-emerald-500/60 transition"
              />
              <span className="text-[10px] text-slate-500 block mt-1">
                Arendator obuna to&apos;lash tugmasini bosganda ushbu havola orqali to&apos;lov qiladi.
              </span>
            </div>

            {/* Card info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Bank Karta Raqami (Fallback)
                </label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="8600 0000 0000 0000"
                  className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-hidden focus:border-emerald-500/60 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Karta Egasi (Ism-Familiya)
                </label>
                <input
                  type="text"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  placeholder="G'AYRATJON X."
                  className="w-full px-3.5 py-2.5 text-xs uppercase font-bold bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-hidden focus:border-emerald-500/60 transition"
                />
              </div>
            </div>

            {/* Telegram Support */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Qo&apos;llab-quvvatlash Telegrami (@username)
              </label>
              <input
                type="text"
                value={supportTelegram}
                onChange={(e) => setSupportTelegram(e.target.value)}
                placeholder="@carenda_admin"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-hidden focus:border-emerald-500/60 transition"
              />
            </div>

            {/* QR Code Upload */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Paynet / To&apos;lov QR-kod Rasmi (PNG / JPG)
              </label>
              <div className="flex items-center gap-3">
                {qrPreviewUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={qrPreviewUrl}
                    alt="Joriy QR kod"
                    className="w-16 h-16 object-contain rounded-xl border border-slate-800 bg-white p-1"
                  />
                )}
                <label className="flex-1 flex items-center justify-center gap-2 p-3.5 border border-dashed border-slate-700 hover:border-amber-400 bg-slate-950 rounded-2xl cursor-pointer text-xs font-medium text-slate-300 transition">
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>{qrFile ? qrFile.name : "Yangi QR-kod rasmini tanlash"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setQrFile(file);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl shadow-sm transition active:scale-98 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{saving ? "Saqlanmoqda..." : "Sozlamalarni Saqlash"}</span>
        </button>
      </form>
    </div>
  );
}
