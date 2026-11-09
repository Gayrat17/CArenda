"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Shield,
  Zap,
  Clock,
  Car,
  Check,
  AlertCircle,
  HelpCircle,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";
import {
  getSubscriptionSettings,
  getMySubscriptionStatus,
  getBootstrap,
} from "@/lib/api";
import { SubscriptionSettings, SubscriptionStatusResponse } from "@/types/subscription";
import { User } from "@/types/fleet";
import { SubscriptionPaymentModal } from "@/components/SubscriptionPaymentModal";

export default function SubscriptionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [subStatus, setSubStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [subscriptionSettings, setSubscriptionSettings] = useState<SubscriptionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [boot, statusData, settingsData] = await Promise.all([
        getBootstrap().catch(() => null),
        getMySubscriptionStatus({ forceRefresh: true }).catch(() => null),
        getSubscriptionSettings({ forceRefresh: true }).catch(() => null),
      ]);

      if (boot?.me) {
        if (!boot.me.is_onboarded && boot.me.is_registered === false) {
          router.replace("/login");
          return;
        }
        if (boot.me.role === "ijarachi" || boot.me.role === "user") {
          router.replace("/my-contracts");
          return;
        }
        setUser(boot.me);
      }
      if (statusData) {
        setSubStatus(statusData);
      }
      if (settingsData) {
        setSubscriptionSettings(settingsData);
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

  const rawPlan = (subStatus?.plan || user?.plan || "free").toLowerCase();
  const isFreePlan = rawPlan === "free" || rawPlan === "trial";
  const planDisplay = isFreePlan ? "Free (Boshlang'ich)" : "Standart";

  const standartPrice =
    subscriptionSettings?.standart_price ||
    subscriptionSettings?.standard_plan_price ||
    150000;

  const isFrozen = Boolean(subStatus?.is_frozen ?? user?.is_frozen);
  const isActive = Boolean(subStatus?.is_active ?? user?.is_subscription_active) && !isFrozen;

  // Remaining days calculation
  const remainingDays =
    typeof subStatus?.remaining_days === "number"
      ? subStatus.remaining_days
      : (() => {
          const targetStr = subStatus?.expires_at || user?.expires_at || "";
          if (!targetStr) return 0;
          const diffMs = new Date(targetStr).getTime() - Date.now();
          return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        })();

  const contractsCount =
    subStatus?.active_contracts_count ??
    subStatus?.contracts_count ??
    subStatus?.cars_count ??
    user?.cars_count ??
    0;

  const maxContracts = subscriptionSettings?.free_max_contracts || 3;
  const pendingReq = subStatus?.pending_request;

  const handlePaymentSuccess = () => {
    setPaymentModalOpen(false);
    setShowSuccessToast(true);
    fetchData();
    setTimeout(() => setShowSuccessToast(false), 5000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
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
              <p className="font-bold">To&apos;lov so&apos;rovi yuborildi!</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Admin to&apos;lovni tekshirgach obunangiz 30 kunga faollashtiriladi.
              </p>
            </div>
          </div>
        )}

        {/* Urgent Warning Banners */}
        {isFrozen && (
          <div className="p-3.5 bg-rose-50 border border-rose-300 text-rose-900 text-xs rounded-2xl flex items-start gap-2.5 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-800">⚠️ Hisobingiz muzlatilgan!</p>
              <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                To&apos;lov muddati o&apos;tganligi sababli hisobingiz muzlatilgan. Xizmatlardan to&apos;liq foydalanish uchun Standart tarif to&apos;lovini amalga oshiring.
              </p>
            </div>
          </div>
        )}

        {!isFrozen && !isActive && !loading && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-2xl flex items-start gap-2.5 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-900">⚠️ Obuna muddatingiz tugagan!</p>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Yangi shartnomalar tuzish va tizimdan cheklovlarsiz foydalanish uchun Standart tarifga o&apos;ting.
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
                ⏳ To&apos;lov so&apos;rovingiz ko&apos;rib chiqilmoqda
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Sizning <b>{pendingReq.plan_display || "Standart"}</b> tarifi ({pendingReq.amount.toLocaleString()} UZS) uchun so&apos;rovingiz admin tomonidan tasdiqlanishi kutilmoqda.
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
                  {planDisplay}
                </h2>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                isFrozen
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : isActive
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              {isFrozen ? "Muzlatilgan" : isActive ? "Faol" : "Muddati tugagan"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/10">
            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-medium">
                Qolgan muddat
              </span>
              <p className="text-xs font-semibold text-slate-100 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                {isFrozen
                  ? "Muzlatilgan"
                  : isActive && remainingDays > 0
                  ? `${remainingDays} kun qoldi`
                  : "Muddati tugagan"}
              </p>
            </div>

            <div className="bg-white/5 p-2.5 rounded-xl border border-white/5 space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-medium">
                Shartnomalar soni
              </span>
              <p className="text-xs font-semibold text-slate-100 flex items-center gap-1">
                <Car className="w-3.5 h-3.5 text-emerald-400" />
                {isFreePlan
                  ? `${contractsCount} / ${maxContracts} ta`
                  : `${contractsCount} ta (Cheksiz)`}
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
            Oddiy va shaffof 2 bosqichli tarif tizimi
          </p>
        </div>

        {/* STRICT 2-TIER COMPARISON CARDS */}
        <div className="space-y-3.5">
          {/* TIER 1: Free (Boshlang'ich) */}
          <div
            className={`p-4 bg-white border rounded-2xl space-y-3 shadow-2xs relative ${
              isFreePlan
                ? "border-emerald-300 ring-1 ring-emerald-200"
                : "border-slate-200/90"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-wide">
                  Boshlang&apos;ich
                </span>
                <h3 className="font-bold text-slate-900 text-base mt-1">
                  Free (Boshlang&apos;ich)
                </h3>
                <p className="text-xs text-slate-500">
                  Yangi foydalanuvchilar uchun 2 oylik bepul sinov
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-extrabold text-slate-900">
                  Bepul
                </span>
                <span className="block text-[10px] text-slate-400">
                  2 oy davomida
                </span>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Maksimal <b>3 ta shartnoma</b> (mashina)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span><b>60 kun (2 oy)</b> to&apos;liq bepul foydalanish</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Oylik to&apos;lovlar jadvali va hisob-kitoblar</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500 text-[11px]">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>2 oydan so&apos;ng Standart tarifga o&apos;tish majburiy</span>
              </li>
            </ul>

            {isFreePlan ? (
              <div className="w-full py-2 bg-emerald-50 text-emerald-700 text-center rounded-xl text-xs font-semibold border border-emerald-200/60">
                ✓ Sizning joriy tarifingiz
              </div>
            ) : (
              <div className="w-full py-2 bg-slate-50 text-slate-400 text-center rounded-xl text-xs font-medium">
                Boshlang&apos;ich sinov tarifi
              </div>
            )}
          </div>

          {/* TIER 2: Standart (To'liq) */}
          <div className="p-4 bg-white border-2 border-blue-600 rounded-2xl space-y-3 shadow-sm relative">
            <div className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-300" />
              To&apos;liq Tarif
            </div>

            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wide flex items-center gap-1 w-fit">
                  <Zap className="w-3 h-3 text-blue-600" />
                  Standart
                </span>
                <h3 className="font-bold text-slate-900 text-base mt-1">
                  Standart (To&apos;liq)
                </h3>
                <p className="text-xs text-slate-500">
                  Cheksiz imkoniyatlar va to&apos;liq avtomatlashtirish
                </p>
              </div>
              <div className="text-right">
                <span className="text-lg font-extrabold text-blue-600">
                  {standartPrice.toLocaleString("uz-UZ")}
                </span>
                <span className="block text-[10px] text-slate-400">
                  UZS / oy (30 kun)
                </span>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2.5">
              <li className="flex items-center gap-2 font-bold text-slate-900">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Cheksiz shartnomalar va mashinalar</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Barcha hisob-kitob va boshqaruv funksiyalari</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Excel (.xlsx) to&apos;liq hisobotlar eksporti</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Telegram bot orqali avtomatik to&apos;lov eslatmalari</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Tezkor 24/7 qo&apos;llab-quvvatlash</span>
              </li>
            </ul>

            <button
              onClick={() => setPaymentModalOpen(true)}
              className="w-full py-3 px-4 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white shadow-xs"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>
                {!isFreePlan
                  ? "Obunani uzaytirish (+30 kun)"
                  : "Standart tarifga o'tish"}
              </span>
            </button>
          </div>
        </div>

        {/* Support Card */}
        {subscriptionSettings?.support_telegram && (
          <div className="p-3.5 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2 text-xs">
              <HelpCircle className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <p className="font-semibold text-slate-800">
                  Savollaringiz bormi?
                </p>
                <p className="text-[11px] text-slate-500">
                  Admin bilan to&apos;g&apos;ridan-to&apos;g&apos;ri bog&apos;laning
                </p>
              </div>
            </div>
            <a
              href={`https://t.me/${subscriptionSettings.support_telegram.replace("@", "")}`}
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
      {paymentModalOpen && (
        <SubscriptionPaymentModal
          planType="standard"
          planName="Standart"
          planPrice={standartPrice}
          paymentSettings={subscriptionSettings}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
