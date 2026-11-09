"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Shield,
  Zap,
  Crown,
  Clock,
  Car,
  Check,
  AlertCircle,
  HelpCircle,
  MessageCircle,
} from "lucide-react";
import {
  getPaymentSettings,
  getMySubscriptionStatus,
  getBootstrap,
} from "@/lib/api";
import { PaymentSettings, SubscriptionStatusResponse } from "@/types/subscription";
import { User } from "@/types/fleet";
import { SubscriptionPaymentModal } from "@/components/SubscriptionPaymentModal";

export default function SubscriptionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [subStatus, setSubStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [selectedPlan, setSelectedPlan] = useState<{
    type: "standard" | "pro";
    name: string;
    price: number;
  } | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [boot, statusData, settingsData] = await Promise.all([
        getBootstrap().catch(() => null),
        getMySubscriptionStatus({ forceRefresh: true }).catch(() => null),
        getPaymentSettings({ forceRefresh: true }).catch(() => null),
      ]);

      if (boot?.me) {
        setUser(boot.me);
      }
      if (statusData) {
        setSubStatus(statusData);
      }
      if (settingsData) {
        setPaymentSettings(settingsData);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Obuna ma'lumotlarini yuklashda xatolik yuz berdi."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Hook into native Telegram WebApp BackButton
  useEffect(() => {
    const tg =
      typeof window !== "undefined"
        ? (window.Telegram?.WebApp as unknown as {
            BackButton?: {
              show: () => void;
              hide: () => void;
              onClick: (cb: () => void) => void;
              offClick: (cb: () => void) => void;
            };
          })
        : null;
    const backBtn = tg?.BackButton;
    if (backBtn) {
      backBtn.show();
      const handleBack = () => router.push("/");
      backBtn.onClick(handleBack);
      return () => {
        backBtn.offClick(handleBack);
        backBtn.hide();
      };
    }
  }, [router]);

  const activePlan = (subStatus?.plan || user?.plan || "trial").toLowerCase();
  const standardPrice = paymentSettings?.standard_plan_price || 120000;
  const proPrice = paymentSettings?.pro_plan_price || 250000;

  // Calculate remaining days
  const expiresAtStr = subStatus?.expires_at || user?.expires_at || "";
  let remainingDaysText = "";
  if (expiresAtStr) {
    const expiresDate = new Date(expiresAtStr);
    const now = new Date();
    const diffMs = expiresDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      remainingDaysText = `${diffDays} kun qoldi`;
    } else {
      remainingDaysText = "Muddati tugagan";
    }
  }

  const pendingReq = subStatus?.pending_request;

  const handleOpenPlanModal = (type: "standard" | "pro") => {
    const name = type === "standard" ? "Standart" : "Pro (Premium)";
    const price = type === "standard" ? standardPrice : proPrice;
    setSelectedPlan({ type, name, price });
  };

  const handlePaymentSuccess = () => {
    setSelectedPlan(null);
    setShowSuccessToast(true);
    fetchData();
    setTimeout(() => setShowSuccessToast(false), 5000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Sticky Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/")}
            className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 transition active:scale-95 cursor-pointer"
            aria-label="Orqaga"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-base text-slate-900">
            Tariflar va Obuna
          </h1>
        </div>
        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-1 rounded-full">
          Carenda SaaS
        </span>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Success Alert */}
        {showSuccessToast && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-2.5 shadow-xs animate-in fade-in duration-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold">To'lov so'rovi yuborildi!</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Admin to'lovni tekshirgach obunangiz 30 kunga faollashtiriladi.
              </p>
            </div>
          </div>
        )}

        {/* Pending Request Alert */}
        {pendingReq && !showSuccessToast && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-2xl flex items-start gap-2.5 shadow-2xs">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold">
                ⏳ To'lov so'rovingiz ko'rib chiqilmoqda
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Sizning <b>{pendingReq.plan_display}</b> tarifi ({pendingReq.amount.toLocaleString()} UZS) uchun so'rovingiz admin tomonidan tasdiqlanishi kutilmoqda.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Current Plan Status Card */}
        <div className="p-4 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl shadow-sm space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/10 text-blue-300 rounded-full">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-300 uppercase font-semibold tracking-wider">
                  Joriy holat
                </p>
                <h2 className="font-bold text-base capitalize">
                  {activePlan === "pro"
                    ? "Pro (Premium)"
                    : activePlan === "standard" || activePlan === "basic"
                    ? "Standart"
                    : "Sinov (Trial)"}
                </h2>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                subStatus?.is_active ?? user?.is_subscription_active
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}
            >
              {subStatus?.is_active ?? user?.is_subscription_active
                ? "Faol"
                : "Tugagan"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-medium">
                Amal qilish muddati
              </span>
              <p className="text-xs font-semibold text-slate-100 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                {remainingDaysText || "Muddatsiz"}
              </p>
            </div>

            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-medium">
                Parkdagi mashinalar
              </span>
              <p className="text-xs font-semibold text-slate-100 flex items-center gap-1">
                <Car className="w-3.5 h-3.5 text-emerald-400" />
                {(subStatus?.cars_count ?? user?.cars_count) || 0} /{" "}
                {(subStatus?.cars_limit ?? user?.cars_limit ?? 0) >= 9999
                  ? "Cheksiz"
                  : `${subStatus?.cars_limit ?? user?.cars_limit ?? 0} ta`}
              </p>
            </div>
          </div>
        </div>

        {/* Section Title */}
        <div className="pt-2">
          <h2 className="text-sm font-bold text-slate-900">
            Mavjud Tarif Rejalari
          </h2>
          <p className="text-[11px] text-slate-500">
            Park hajmiga mos qulay tarifni tanlang
          </p>
        </div>

        {/* Pricing Tiers List */}
        <div className="space-y-3.5">
          {/* 1. Trial Tier */}
          <div className="p-4 bg-white border border-slate-200/90 rounded-2xl space-y-3 shadow-2xs relative">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md uppercase tracking-wide">
                  Sinov muddati
                </span>
                <h3 className="font-bold text-slate-900 text-base mt-1">
                  Sinov (Trial)
                </h3>
                <p className="text-xs text-slate-500">
                  Tizimni bepul sinab ko'rish uchun
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-extrabold text-slate-900">
                  Bepul
                </span>
                <span className="block text-[10px] text-slate-400">7 kun</span>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>3 tagacha mashina va shartnoma</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Oylik to'lovlar jadvali</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Telegram bot orqali bildirishnomalar</span>
              </li>
            </ul>

            {activePlan === "trial" && (
              <div className="w-full py-2 bg-slate-100 text-slate-600 text-center rounded-xl text-xs font-semibold">
                Sizning joriy tarifingiz
              </div>
            )}
          </div>

          {/* 2. Standart Tier */}
          <div className="p-4 bg-white border-2 border-blue-500/70 rounded-2xl space-y-3 shadow-xs relative">
            <div className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
              Ommabop
            </div>

            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wide flex items-center gap-1 w-fit">
                  <Zap className="w-3 h-3 text-blue-600" />
                  Standart
                </span>
                <h3 className="font-bold text-slate-900 text-base mt-1">
                  Standart Reja
                </h3>
                <p className="text-xs text-slate-500">
                  Kichik va o'rta avtoparklar uchun
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-extrabold text-blue-600">
                  {standardPrice.toLocaleString("uz-UZ")}
                </span>
                <span className="block text-[10px] text-slate-400">
                  UZS / oy
                </span>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
              <li className="flex items-center gap-2 font-medium text-slate-800">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>15 tagacha mashina va shartnoma</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Avtomatlashtirilgan Telegram eslatmalari</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Kechikkan to'lovlarni nazorat qilish</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Mijozlar shaxsiy kabineti</span>
              </li>
            </ul>

            <button
              onClick={() => handleOpenPlanModal("standard")}
              className={`w-full py-2.5 px-4 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activePlan === "standard" || activePlan === "basic"
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  : "bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white shadow-xs"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {activePlan === "standard" || activePlan === "basic"
                  ? "Muddatni 30 kunga uzaytirish"
                  : "Standart tarifiga o'tish"}
              </span>
            </button>
          </div>

          {/* 3. Pro Tier */}
          <div className="p-4 bg-gradient-to-b from-indigo-50/70 to-white border-2 border-indigo-500 rounded-2xl space-y-3 shadow-xs relative">
            <div className="absolute -top-2.5 right-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs flex items-center gap-1">
              <Crown className="w-3 h-3 text-amber-300" />
              Eng yaxshi tanlov
            </div>

            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md uppercase tracking-wide flex items-center gap-1 w-fit">
                  <Crown className="w-3 h-3 text-indigo-700" />
                  Premium
                </span>
                <h3 className="font-bold text-slate-900 text-base mt-1">
                  Pro (Premium)
                </h3>
                <p className="text-xs text-slate-500">
                  Cheksiz imkoniyatlar va eksport
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-extrabold text-indigo-700">
                  {proPrice.toLocaleString("uz-UZ")}
                </span>
                <span className="block text-[10px] text-slate-400">
                  UZS / oy
                </span>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-slate-600 border-t border-indigo-100 pt-2.5">
              <li className="flex items-center gap-2 font-bold text-indigo-900">
                <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Cheksiz mashinalar va shartnomalar</span>
              </li>
              <li className="flex items-center gap-2 font-medium text-slate-800">
                <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Excel (.xlsx) to'liq hisobotlar eksporti</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Avtomatlashtirilgan ertalabki eslatmalar</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Ustuvor qo'llab-quvvatlash (24/7)</span>
              </li>
            </ul>

            <button
              onClick={() => handleOpenPlanModal("pro")}
              className={`w-full py-2.5 px-4 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activePlan === "pro"
                  ? "bg-indigo-100 hover:bg-indigo-200 text-indigo-900"
                  : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white shadow-xs"
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              <span>
                {activePlan === "pro"
                  ? "Muddatni 30 kunga uzaytirish"
                  : "Pro tarifiga o'tish"}
              </span>
            </button>
          </div>
        </div>

        {/* Support Card */}
        {paymentSettings?.support_telegram && (
          <div className="p-3.5 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2 text-xs">
              <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <p className="font-semibold text-slate-800">
                  Savollaringiz bormi?
                </p>
                <p className="text-[11px] text-slate-500">
                  Admin bilan to'g'ridan-to'g'ri bog'laning
                </p>
              </div>
            </div>
            <a
              href={`https://t.me/${paymentSettings.support_telegram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-semibold transition"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Yordam</span>
            </a>
          </div>
        )}
      </main>

      {/* Subscription Payment Drawer/Modal */}
      {selectedPlan && (
        <SubscriptionPaymentModal
          planType={selectedPlan.type}
          planName={selectedPlan.name}
          planPrice={selectedPlan.price}
          paymentSettings={paymentSettings}
          onClose={() => setSelectedPlan(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
