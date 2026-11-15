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
  LogOut,
} from "lucide-react";
import { User as UserType } from "@/types/fleet";
import { logout, updateMe } from "@/lib/api";
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

  // Logout state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const identity = resolveUserIdentity(user);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      if (user.default_annual_percent !== undefined && user.default_annual_percent !== null) {
        setDefaultPercent(formatPercent(user.default_annual_percent));
      }
    }
  }, [user]);

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
              Arendator
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
                Tarif: {(user?.plan || "free").toLowerCase() === "standard" ? "Standart" : "Free (Sinov)"}
              </h3>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                user?.is_frozen
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : user?.is_subscription_active
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              {user?.is_frozen ? "Muzlatilgan" : user?.is_subscription_active ? "Faol" : "Muddati tugagan"}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-indigo-200">
              Arendator (Egasi)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
          <div>
            <p className="text-[10px] text-slate-400">Shartnomalar limiti:</p>
            <p className="font-bold text-white mt-0.5">
              {(user?.plan || "free").toLowerCase() === "standard"
                ? `${user?.cars_count || 0} ta (Cheksiz)`
                : `${user?.cars_count || 0} / 3 ta`}
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
      {(user?.role === "arendator" || user?.role === "owner") && (user?.invite_code || user?.tenant_code) && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 uppercase tracking-wide">
              Arendator Kodingiz (Maxsus Kod)
            </span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">
              Mijozlar uchun
            </span>
          </div>
          <div className="flex items-center justify-between bg-white px-3.5 py-2.5 rounded-xl border border-blue-200">
            <span className="font-mono font-extrabold text-lg tracking-wider text-blue-700">
              {user.invite_code || user.tenant_code}
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
            Mijozlaringiz (ijarachilar) tizimga kirganda shartnomalarini ko&apos;rish uchun ushbu maxsus kodni kiritishi lozim.
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
                className="w-full px-3.5 pr-9 py-2.5 text-base font-bold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold pointer-events-none select-none">%</span>
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

      {/* Hisobdan chiqish / Log Out Section */}
      <div className="pt-2 pb-6">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full py-3.5 px-4 rounded-2xl bg-red-500/10 hover:bg-red-500/15 text-red-500 border border-red-500/20 font-bold text-xs shadow-2xs transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4 text-red-500" />
          <span>Hisobdan chiqish</span>
        </button>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Hisobdan chiqish
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Haqiqatan ham hisobdan chiqmoqchimisiz?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setShowLogoutConfirm(false)}
                className="py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={loggingOut}
                onClick={async () => {
                  setLoggingOut(true);
                  await logout();
                }}
                className="py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{loggingOut ? "Chiqilmoqda..." : "Chiqish"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
