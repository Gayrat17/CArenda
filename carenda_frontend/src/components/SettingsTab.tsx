"use client";

import React, { useState, useEffect } from "react";
import { User as UserIcon, Shield, Check, Save, Sparkles, AlertCircle, Copy } from "lucide-react";
import { User as UserType } from "@/types/fleet";
import { updateMe } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { resolveUserIdentity } from "@/lib/identity";

interface SettingsTabProps {
  user: UserType | null;
  onRefreshUser: () => void;
}

export function SettingsTab({ user, onRefreshUser }: SettingsTabProps) {
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [defaultPercent, setDefaultPercent] = useState(
    user?.default_annual_percent || "20.00"
  );
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identity = resolveUserIdentity(user);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setPhone(user.phone || "");
      if (user.default_annual_percent) {
        setDefaultPercent(user.default_annual_percent);
      }
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setSavedSuccess(false);

      const payload = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        default_annual_percent: parseFloat(defaultPercent) || 20,
      };

      await updateMe(payload);

      setSavedSuccess(true);
      onRefreshUser();
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sozlamalarni saqlashda xatolik.");
    } finally {
      setLoading(false);
    }
  };

  const presetPercents = ["15.00", "20.00", "25.00", "30.00"];

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
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-3xl shadow-sm space-y-3">
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
      </div>

      {/* Tenant Code Card for Owner */}
      {user?.role === "owner" && user?.tenant_code && (
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
              placeholder="Masalan: Jamshid Karimov"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Telefon raqami
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 123 45 67"
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
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
                step="0.01"
                min="0"
                required
                value={defaultPercent}
                onChange={(e) => setDefaultPercent(e.target.value)}
                placeholder="20.00"
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
                    parseFloat(defaultPercent) === parseFloat(p)
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {parseFloat(p)}%
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
    </div>
  );
}
