"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Shield,
  Check,
  Save,
  Sparkles,
  AlertCircle,
  Copy,
  Lock,
  ChevronRight,
  CreditCard,
  QrCode,
  Upload,
} from "lucide-react";
import { User as UserType } from "@/types/fleet";
import { getPaymentSettings, updateMe, updatePaymentSettings } from "@/lib/api";
import { formatDateTime, formatPercent } from "@/lib/utils";
import { resolveUserIdentity } from "@/lib/identity";

interface SettingsTabProps {
  user: UserType | null;
  onRefreshUser: (updatedUser?: UserType) => void;
}

export function SettingsTab({ user, onRefreshUser }: SettingsTabProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [defaultPercent, setDefaultPercent] = useState(
    formatPercent(user?.default_annual_percent) || "20"
  );
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Superadmin Payment Settings State
  const isSuperadmin = user?.role === "superadmin";
  const [paynetUrl, setPaynetUrl] = useState("");
  const [standardPrice, setStandardPrice] = useState(120000);
  const [proPrice, setProPrice] = useState(250000);
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [supportTelegram, setSupportTelegram] = useState("");
  const [currentQrImage, setCurrentQrImage] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [savingPaymentSettings, setSavingPaymentSettings] = useState(false);
  const [paymentSettingsSuccess, setPaymentSettingsSuccess] = useState(false);
  const [paymentSettingsError, setPaymentSettingsError] = useState<string | null>(null);

  const identity = resolveUserIdentity(user);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      if (user.default_annual_percent !== undefined && user.default_annual_percent !== null) {
        setDefaultPercent(formatPercent(user.default_annual_percent));
      }
    }
  }, [user]);

  useEffect(() => {
    if (isSuperadmin) {
      getPaymentSettings({ forceRefresh: true })
        .then((s) => {
          setPaynetUrl(s.paynet_url || "");
          setStandardPrice(s.standard_plan_price || 120000);
          setProPrice(s.pro_plan_price || 250000);
          setCardNumber(s.card_number || "");
          setCardHolder(s.card_holder || "");
          setSupportTelegram(s.support_telegram || "");
          setCurrentQrImage(s.paynet_qr_image);
        })
        .catch(() => {
          // ignore
        });
    }
  }, [isSuperadmin]);

  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingPaymentSettings(true);
      setPaymentSettingsError(null);
      setPaymentSettingsSuccess(false);

      const formData = new FormData();
      formData.append("paynet_url", paynetUrl.trim());
      formData.append("standard_plan_price", String(standardPrice));
      formData.append("pro_plan_price", String(proPrice));
      formData.append("card_number", cardNumber.trim());
      formData.append("card_holder", cardHolder.trim());
      formData.append("support_telegram", supportTelegram.trim());
      if (qrFile) {
        formData.append("paynet_qr_image", qrFile);
      }

      const updated = await updatePaymentSettings(formData);
      setCurrentQrImage(updated.paynet_qr_image);
      setPaymentSettingsSuccess(true);
      setTimeout(() => setPaymentSettingsSuccess(false), 4000);
    } catch (err: unknown) {
      setPaymentSettingsError(
        err instanceof Error ? err.message : "Sozlamalarni saqlashda xatolik yuz berdi."
      );
    } finally {
      setSavingPaymentSettings(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setSavedSuccess(false);

      const intPercent = Math.round(parseFloat(defaultPercent)) || 20;

      const payload = {
        full_name: fullName.trim(),
        default_annual_percent: intPercent,
      };

      const updated = await updateMe(payload);

      setSavedSuccess(true);
      onRefreshUser(updated);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sozlamalarni saqlashda xatolik.");
    } finally {
      setLoading(false);
    }
  };

  const presetPercents = ["15", "20", "25", "30"];

  const handleCopyCode = async () => {
    if (!user?.tenant_code) return;
    try {
      await navigator.clipboard.writeText(user.tenant_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 leading-tight">
          Sozlamalar
        </h1>
        <p className="text-xs text-slate-500">
          Shaxsiy profil va hisob-kitob shartlari
        </p>
      </div>

      {/* Top Profile Identity Card */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-between gap-3">
        <div className="space-y-1">
          {/* Line 1 (Primary): Profile Name + Role Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-extrabold text-slate-900 leading-tight">
              {identity.fullName}
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-100 text-blue-800 rounded-md">
              {user?.role === "superadmin" ? "Super Admin" : "Arendator"}
            </span>
          </div>

          {/* Line 2 (Directly below name, above ID): Telegram Username formatted as @username */}
          <div>
            {identity.username ? (
              <a
                href={`https://t.me/${identity.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-2.5 py-0.5 rounded-lg border border-sky-200/80 transition"
                title="Telegram profili"
              >
                <span>@{identity.username}</span>
              </a>
            ) : (
              <span className="text-xs font-medium text-slate-500">
                {identity.fullName}
              </span>
            )}
          </div>

          {/* Line 3 (Directly underneath username): Subtle monospace ID badge + Phone */}
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 flex-wrap pt-0.5">
            {identity.telegramId && (
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">
                ID: {identity.telegramId}
              </span>
            )}
            {identity.phone && (
              <span className="text-slate-500 font-sans font-medium">
                📞 {identity.phone}
              </span>
            )}
          </div>
        </div>

        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-xs shrink-0">
          <UserIcon className="w-5 h-5" />
        </div>
      </div>

      {/* Subscription & Role Status Card */}
      <div
        onClick={() => router.push("/subscription")}
        className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-3xl shadow-sm space-y-3 cursor-pointer hover:shadow-md transition active:scale-[0.99] group relative overflow-hidden"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-full">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-indigo-200 uppercase font-semibold">
                Obuna holati
              </p>
              <h3 className="font-bold text-base capitalize">
                Tarif: {user?.plan || "Trial"}
              </h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                user?.is_subscription_active
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}
            >
              {user?.is_subscription_active ? "Faol" : "Muddati tugagan"}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-indigo-200">
              {user?.role === "superadmin" ? "Super Admin" : "Arendator (Egasi)"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
          <div>
            <p className="text-[10px] text-slate-400">Mashinalar limiti:</p>
            <p className="font-bold text-white mt-0.5">
              {user?.cars_count || 0} / {user?.cars_limit || 0} ta
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Amal qilish muddati:</p>
            <p className="font-semibold text-slate-200 mt-0.5">
              {formatDateTime(user?.expires_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-indigo-200 pt-1 border-t border-white/10 group-hover:text-white transition">
          <span className="text-[11px] font-medium">Tariflarni ko'rish va obuna bo'lish</span>
          <span className="text-xs font-bold flex items-center gap-0.5">
            Batafsil <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      {/* Tenant Code Card for Arendator */}
      {(user?.role === "arendator" || user?.role === "owner") && user?.tenant_code && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 uppercase tracking-wide">
              Arendator Kodingiz
            </span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
              Mijozlar uchun
            </span>
          </div>
          <div className="flex items-center justify-between bg-white px-3.5 py-2.5 rounded-xl border border-blue-200">
            <span className="font-mono font-extrabold text-lg tracking-wider text-blue-700">
              {user.tenant_code}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition active:scale-95"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? "Nusxalandi" : "Nusxalash"}</span>
            </button>
          </div>
          <p className="text-[11px] text-blue-700 leading-relaxed">
            Mijozlaringiz (haydovchilar) botga kirganda shartnomalarini ko&apos;rish uchun ushbu kodni kiritishi lozim.
          </p>
        </div>
      )}

      {/* Profile and Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {savedSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>Sozlamalar muvaffaqiyatli saqlandi!</span>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
            Arendator Profili
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              F.I.SH (To'liq ism) *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jamshid Karimov"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">
                Telefon raqami
              </label>
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                O'zgartirib bo'lmaydi
              </span>
            </div>
            <div className="relative">
              <input
                type="text"
                readOnly
                disabled
                value={user?.phone || identity.phone || "Kiritilmagan"}
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed select-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md">
                Telegram orqali
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              Telefon raqami Telegram profilingiz orqali tasdiqlangan va xavfsizlik maqsadida o'zgartirilmaydi.
            </p>
          </div>
        </div>

        {/* Financial Default % Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Standart Shartlar
            </h3>
            <span className="text-[11px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded">
              Yillik foiz
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Standart yillik foiz (%) *
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                required
                value={defaultPercent}
                onChange={(e) => setDefaultPercent(e.target.value)}
                className="w-full px-3.5 py-2.5 text-base font-bold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
            </div>

            {/* Quick preset buttons */}
            <div className="grid grid-cols-4 gap-1.5 mt-2.5">
              {presetPercents.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDefaultPercent(p)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition ${
                    parseInt(defaultPercent, 10) === parseInt(p, 10)
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              💡 Yangi ijara shartnomasi ochilganda ushbu foiz avtomatik tanlanadi (har bir shartnomada uni o&apos;zgartirish mumkin).
            </p>
          </div>
        </div>

        {/* Save button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? "Saqlanmoqda..." : "Sozlamalarni saqlash"}
        </button>
      </form>

      {/* Superadmin Payment Settings Section */}
      {isSuperadmin && (
        <div className="pt-2">
          <form
            onSubmit={handleSavePaymentSettings}
            className="bg-white p-5 rounded-3xl border-2 border-indigo-200/80 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    To'lov Sozlamalari (Superadmin)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Paynet, QR kod va obuna tarif narxlari
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
                Admin Panel
              </span>
            </div>

            {paymentSettingsError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{paymentSettingsError}</span>
              </div>
            )}

            {paymentSettingsSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>To'lov sozlamalari muvaffaqiyatli yangilandi!</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paynet to'lov havolasi (P2P / QR URL)
                </label>
                <input
                  type="url"
                  value={paynetUrl}
                  onChange={(e) => setPaynetUrl(e.target.value)}
                  placeholder="https://paynet.uz/p2p/..."
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Standart narx (UZS / oy)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={standardPrice}
                    onChange={(e) => setStandardPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pro narx (UZS / oy)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={proPrice}
                    onChange={(e) => setProPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Karta raqami (Fallback)
                  </label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="8600 0000 0000 0000"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Karta egasi
                  </label>
                  <input
                    type="text"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    placeholder="G'AYRATJON X."
                    className="w-full px-3.5 py-2.5 text-xs uppercase bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Qo'llab-quvvatlash Telegrami (@username)
                </label>
                <input
                  type="text"
                  value={supportTelegram}
                  onChange={(e) => setSupportTelegram(e.target.value)}
                  placeholder="@carenda_admin"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              {/* Paynet QR Image Upload */}
              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paynet QR-kod rasmi (PNG/JPG)
                </label>
                <div className="flex items-center gap-3">
                  {currentQrImage && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={currentQrImage}
                      alt="Joriy QR kod"
                      className="w-14 h-14 object-contain rounded-xl border border-slate-200 bg-white p-1"
                    />
                  )}
                  <label className="flex-1 flex items-center justify-center gap-2 p-3 border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 rounded-xl cursor-pointer text-xs font-medium text-slate-600 transition">
                    <Upload className="w-4 h-4 text-indigo-600" />
                    <span>{qrFile ? qrFile.name : "Yangi QR rasm yuklash"}</span>
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

            <button
              type="submit"
              disabled={savingPaymentSettings}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>
                {savingPaymentSettings ? "Saqlanmoqda..." : "To'lov Sozlamalarini Saqlash"}
              </span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
