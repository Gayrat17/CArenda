"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  DollarSign,
  AlertCircle,
  Clock,
  Phone,
  CheckCircle2,
  ShieldCheck,
  FileSpreadsheet,
  Copy,
  Check,
  MessageSquare,
  Lock,
  PlusCircle,
  CalendarClock,
  Calendar,
  FileText,
  ChevronRight,
} from "lucide-react";
import {
  DashboardResponse,
  OverduePaymentItem,
  UpcomingPaymentItem,
  User,
} from "@/types/fleet";
import {
  formatDate,
  formatUSD,
  cleanPhoneNumber,
  initiatePhoneCall,
} from "@/lib/utils";
import { downloadExcelReport } from "@/lib/api";
import { resolveUserIdentity } from "@/lib/identity";

interface DashboardTabProps {
  user: User | null;
  dashboard: DashboardResponse | null;
  loading: boolean;
  onPaymentClick: (payment: OverduePaymentItem | UpcomingPaymentItem) => void;
  onRefresh: () => void;
  onNavigateTab: (tab: "dashboard" | "cars" | "contract" | "settings") => void;
}

export function DashboardTab({
  user,
  dashboard,
  loading: _loading,
  onPaymentClick,
  onNavigateTab,
}: DashboardTabProps) {
  const router = useRouter();
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeListTab, setActiveListTab] = useState<"overdue" | "upcoming">("overdue");

  const handleCopyTenantCode = async () => {
    if (!user?.tenant_code) return;
    try {
      await navigator.clipboard.writeText(user.tenant_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloadingExcel(true);
      await downloadExcelReport();
    } catch (err: unknown) {
      alert(
        err instanceof Error
          ? err.message
          : "Excel hisobotini yuklab olishda xatolik."
      );
    } finally {
      setDownloadingExcel(false);
    }
  };

  const identity = resolveUserIdentity(user);
  const overdueList = dashboard?.overdue_payments || [];
  const upcomingList = dashboard?.upcoming_payments || [];
  const overdueCount = dashboard?.overdue_count ?? overdueList.length;
  const upcomingCount = dashboard?.upcoming_count ?? upcomingList.length;

  const totalContracts =
    dashboard?.total_contracts_count ??
    (dashboard?.active_contracts_count || 0) +
      (dashboard?.completed_contracts_count || 0);

  const collectionRate = Math.min(
    100,
    Math.max(0, dashboard?.this_month_collection_rate ?? 0)
  );

  return (
    <div className="space-y-4 pb-28">
      {/* 1. Top Header Bar & User Identity */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">
              Carenda Platformasi
            </span>

            {/* Profile Name + Role Badge + Tenant Code */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1
                suppressHydrationWarning
                className="text-xl font-extrabold text-slate-900 leading-tight"
              >
                {identity.fullName}
              </h1>
              <span
                suppressHydrationWarning
                className="px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-100 text-blue-800 rounded-md"
              >
                {user?.role === "superadmin" ? "Super Admin" : "Arendator"}
              </span>
              {user?.tenant_code && (
                <button
                  type="button"
                  onClick={handleCopyTenantCode}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-mono font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition active:scale-95"
                  title="Arendator kodi (nusxalash uchun bosing)"
                >
                  {copiedCode ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{user.tenant_code}</span>
                </button>
              )}
            </div>

            {/* Telegram Username */}
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

            {/* Telegram ID + Phone */}
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

          {/* Subscription Badge */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={() => router.push("/subscription")}
              className="px-3 py-1 text-xs font-semibold uppercase bg-blue-100 hover:bg-blue-200 active:scale-95 text-blue-800 rounded-full transition cursor-pointer flex items-center gap-1 shadow-2xs"
              title="Tariflar va obuna"
            >
              <span>{user?.plan || "Trial"}</span>
              <span className="text-[10px] text-blue-600 font-bold">›</span>
            </button>
            <span className="text-[11px] text-slate-500 font-medium">
              {dashboard?.active_contracts_count || 0} /{" "}
              {user?.cars_limit || "∞"} shartnoma
            </span>
          </div>
        </div>
      </div>

      {/* Skeletons while initial dashboard data is loading */}
      {!dashboard ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-44 bg-white/70 border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div className="h-4 bg-slate-200 rounded w-1/3" />
            <div className="h-8 bg-slate-200 rounded w-1/2" />
            <div className="h-3 bg-slate-200 rounded w-full" />
            <div className="h-6 bg-slate-200 rounded w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 bg-white/70 border border-slate-100 rounded-2xl p-4 shadow-xs space-y-2"
              >
                <div className="h-3 bg-slate-200 rounded w-2/3" />
                <div className="h-5 bg-slate-200 rounded w-1/2" />
                <div className="h-2.5 bg-slate-200 rounded w-3/4" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-11 bg-slate-200 rounded-2xl" />
            <div className="h-11 bg-slate-200 rounded-2xl" />
          </div>
          <div className="h-40 bg-white/70 border border-slate-100 rounded-3xl" />
        </div>
      ) : (
        <>
          {/* 2. Primary Financial Hero Card (Monthly Performance & Portfolio) */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950 text-white p-5 rounded-3xl shadow-md border border-indigo-900/40 space-y-4">
            <div className="flex items-center justify-between text-xs text-indigo-200 font-medium">
              <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[11px] text-blue-300">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Joriy oy tushumi
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]">
                {collectionRate}% yig&apos;ildi
              </span>
            </div>

            {/* Collected amount this month */}
            <div>
              <p className="text-3xl font-black tracking-tight text-white">
                {formatUSD(dashboard.this_month_collected_usd || "0.00")}
              </p>
              <div className="flex items-center justify-between text-[11px] text-indigo-200/80 pt-1">
                <span>
                  Reja: {formatUSD(dashboard.this_month_expected_usd || "0.00")}
                </span>
                <span>
                  Qoldiq: {formatUSD(dashboard.this_month_remaining_usd || "0.00")}
                </span>
              </div>
            </div>

            {/* Collection Progress Bar */}
            <div className="space-y-1">
              <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-400 to-cyan-400 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${collectionRate}%` }}
                />
              </div>
            </div>

            {/* Portfolio Total Summary Footer */}
            <div className="pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-center">
              <div className="space-y-0.5">
                <span className="text-[10px] text-indigo-300 block">Jami reja</span>
                <span className="text-xs font-bold text-white">
                  {formatUSD(dashboard.total_expected_usd)}
                </span>
              </div>
              <div className="space-y-0.5 border-x border-white/10">
                <span className="text-[10px] text-indigo-300 block">Jami tushum</span>
                <span className="text-xs font-bold text-emerald-400">
                  {formatUSD(dashboard.total_collected_usd)}
                </span>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-indigo-300 block">Portfel qoldig&apos;i</span>
                <span className="text-xs font-bold text-rose-300">
                  {formatUSD(dashboard.total_remaining_usd)}
                </span>
              </div>
            </div>
          </div>

          {/* 3. KPI Summary Grid (2x2) */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Card 1: Active Contracts */}
            <div
              onClick={() => onNavigateTab("cars")}
              className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-xs space-y-1 cursor-pointer transition active:scale-98 hover:border-blue-200"
            >
              <div className="flex items-center justify-between text-slate-500 text-xs">
                <span className="font-semibold text-slate-700">Faol shartnomalar</span>
                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                  <FileText className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-xl font-extrabold text-slate-900">
                {dashboard.active_contracts_count || 0} ta
              </p>
              <p className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Jami: {totalContracts} ta</span>
                <span className="text-blue-600 font-semibold flex items-center">
                  Ko&apos;rish <ChevronRight className="w-2.5 h-2.5" />
                </span>
              </p>
            </div>

            {/* Card 2: Overdue Payments */}
            <div
              onClick={() => setActiveListTab("overdue")}
              className={`p-3.5 rounded-2xl border shadow-xs space-y-1 cursor-pointer transition active:scale-98 ${
                overdueCount > 0
                  ? "bg-rose-50/70 border-rose-200/80 hover:border-rose-300"
                  : "bg-white border-slate-100 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-rose-800">Muddati o&apos;tgan</span>
                <div className="p-1.5 bg-rose-100 text-rose-600 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-xl font-extrabold text-rose-600">
                {overdueCount} ta
              </p>
              <p className="text-[10px] text-rose-700/80 font-medium">
                Qarz: {formatUSD(dashboard.total_overdue_usd || "0.00")}
              </p>
            </div>

            {/* Card 3: Upcoming Payments (Next 7 Days) */}
            <div
              onClick={() => setActiveListTab("upcoming")}
              className={`p-3.5 rounded-2xl border shadow-xs space-y-1 cursor-pointer transition active:scale-98 ${
                upcomingCount > 0
                  ? "bg-amber-50/70 border-amber-200/80 hover:border-amber-300"
                  : "bg-white border-slate-100 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-800">Yaqin 7 kunda</span>
                <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                  <CalendarClock className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-xl font-extrabold text-amber-800">
                {upcomingCount} ta
              </p>
              <p className="text-[10px] text-amber-700/80 font-medium">
                Kutilmoqda: {formatUSD(dashboard.total_upcoming_usd || "0.00")}
              </p>
            </div>

            {/* Card 4: Completed Contracts */}
            <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-800">Yopilgan</span>
                <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="text-xl font-extrabold text-emerald-800">
                {dashboard.completed_contracts_count || 0} ta
              </p>
              <p className="text-[10px] text-emerald-700/80 font-medium">
                To&apos;liq to&apos;langan
              </p>
            </div>
          </div>

          {/* 4. Quick Actions Bar */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab("contract")}
              className="flex items-center justify-center gap-2 py-3 px-3.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-2xl text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>Yangi shartnoma</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={downloadingExcel}
              className="flex items-center justify-center gap-2 py-3 px-3.5 bg-white hover:bg-slate-50 active:scale-98 text-slate-700 border border-slate-200/90 rounded-2xl text-xs font-semibold shadow-2xs transition disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">
                {downloadingExcel ? "Tayyorlanmoqda..." : "Excel hisobot"}
              </span>
            </button>
          </div>

          {/* 5. "Diqqat talab qiladi" Actionable Section with Segmented Tabs */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-extrabold text-slate-900">
                Diqqat talab qiladi
              </h2>
            </div>

            {/* Segmented Filter Buttons */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100/90 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveListTab("overdue")}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeListTab === "overdue"
                    ? "bg-white text-rose-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>Muddati o&apos;tgan</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeListTab === "overdue"
                      ? "bg-rose-100 text-rose-700 font-bold"
                      : "bg-slate-200 text-slate-600 font-semibold"
                  }`}
                >
                  {overdueCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveListTab("upcoming")}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeListTab === "upcoming"
                    ? "bg-white text-amber-800 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Yaqin to&apos;lovlar</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeListTab === "upcoming"
                      ? "bg-amber-100 text-amber-800 font-bold"
                      : "bg-slate-200 text-slate-600 font-semibold"
                  }`}
                >
                  {upcomingCount}
                </span>
              </button>
            </div>

            {/* TAB 1: Overdue Payments List */}
            {activeListTab === "overdue" && (
              <div className="space-y-2.5">
                {overdueList.length === 0 ? (
                  <div className="p-6 bg-white border border-slate-100 rounded-3xl text-center space-y-2 shadow-xs">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm">
                      Qarzdorliklar mavjud emas
                    </h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Barcha to&apos;lovlar o&apos;z vaqtida amalga oshirilgan.
                    </p>
                  </div>
                ) : (
                  overdueList.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 bg-white border border-rose-100/90 rounded-2xl shadow-xs flex flex-col gap-3 transition hover:border-rose-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {item.car_name}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 rounded">
                              {item.plate_number}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium capitalize">
                            👤 {item.driver_name}
                          </p>
                        </div>

                        <div className="flex flex-col items-end">
                          <span className="text-sm font-extrabold text-rose-600">
                            {formatUSD(item.remaining_amount)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            kutilmoqda
                          </span>
                        </div>
                      </div>

                      {item.comment && (
                        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50/90 border border-amber-200/80 rounded-xl text-xs text-amber-900">
                          <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-[10px] text-amber-700 uppercase tracking-wide block">
                              Izoh:
                            </span>
                            <span className="text-xs break-words leading-tight">
                              {item.comment}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-50 flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-rose-600 font-medium">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {item.days_overdue === 0 ? (
                              <span className="font-bold text-amber-600">
                                Bugun to&apos;lov kuni ({formatDate(item.due_date)})
                              </span>
                            ) : (
                              <>
                                Muddati: {formatDate(item.due_date)} (
                                <span className="font-bold">
                                  {item.days_overdue} kun kechikdi
                                </span>
                                )
                              </>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.driver_phone && (
                            <a
                              href={`tel:${cleanPhoneNumber(item.driver_phone)}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                initiatePhoneCall(item.driver_phone);
                              }}
                              className="p-2 bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-600 rounded-lg border border-blue-200/60 transition cursor-pointer flex items-center justify-center shadow-2xs"
                              title="Haydovchiga qo'ng'iroq qilish"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {item.can_pay === false ? (
                            <button
                              type="button"
                              disabled
                              className="px-3 py-1.5 bg-slate-100 text-slate-400 font-semibold rounded-lg text-xs cursor-not-allowed select-none border border-slate-200 flex items-center gap-1 opacity-80"
                              title="Oldingi oylar to'lovi to'liq yopilmaguncha bu oyni to'lab bo'lmaydi"
                            >
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                              Oldingi oy to&apos;lanmagan
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onPaymentClick(item)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-lg shadow-xs text-xs transition cursor-pointer"
                            >
                              To&apos;lov qabul qilish
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: Upcoming Payments (Next 7 Days) */}
            {activeListTab === "upcoming" && (
              <div className="space-y-2.5">
                {upcomingList.length === 0 ? (
                  <div className="p-6 bg-white border border-slate-100 rounded-3xl text-center space-y-2 shadow-xs">
                    <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm">
                      Yaqin to&apos;lovlar yo&apos;q
                    </h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Keyingi 7 kun ichida kutilayotgan to&apos;lovlar mavjud emas.
                    </p>
                  </div>
                ) : (
                  upcomingList.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 bg-white border border-amber-100/90 rounded-2xl shadow-xs flex flex-col gap-3 transition hover:border-amber-300"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {item.car_name}
                            </span>
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 rounded">
                              {item.plate_number}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium capitalize">
                            👤 {item.driver_name}
                          </p>
                        </div>

                        <div className="flex flex-col items-end">
                          <span className="text-sm font-extrabold text-blue-600">
                            {formatUSD(item.remaining_amount)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            kutilmoqda
                          </span>
                        </div>
                      </div>

                      {item.comment && (
                        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50/90 border border-amber-200/80 rounded-xl text-xs text-amber-900">
                          <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-[10px] text-amber-700 uppercase tracking-wide block">
                              Izoh:
                            </span>
                            <span className="text-xs break-words leading-tight">
                              {item.comment}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-50 flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-amber-700 font-medium">
                          <CalendarClock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                          <span>
                            {item.days_until_due === 0 ? (
                              <span className="font-bold text-amber-700">
                                Bugun to&apos;lov kuni ({formatDate(item.due_date)})
                              </span>
                            ) : item.days_until_due === 1 ? (
                              <span className="font-bold text-blue-700">
                                Ertaga ({formatDate(item.due_date)})
                              </span>
                            ) : (
                              <>
                                Sana: {formatDate(item.due_date)} (
                                <span className="font-bold text-slate-700">
                                  {item.days_until_due} kundan keyin
                                </span>
                                )
                              </>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.driver_phone && (
                            <a
                              href={`tel:${cleanPhoneNumber(item.driver_phone)}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                initiatePhoneCall(item.driver_phone);
                              }}
                              className="p-2 bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-600 rounded-lg border border-blue-200/60 transition cursor-pointer flex items-center justify-center shadow-2xs"
                              title="Haydovchiga qo'ng'iroq qilish"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {item.can_pay === false ? (
                            <button
                              type="button"
                              disabled
                              className="px-3 py-1.5 bg-slate-100 text-slate-400 font-semibold rounded-lg text-xs cursor-not-allowed select-none border border-slate-200 flex items-center gap-1 opacity-80"
                              title="Oldingi oylar to'lovi to'liq yopilmaguncha bu oyni to'lab bo'lmaydi"
                            >
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                              Oldingi oy to&apos;lanmagan
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onPaymentClick(item)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-lg shadow-xs text-xs transition cursor-pointer"
                            >
                              To&apos;lov qabul qilish
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 6. Empty State if No Contracts exist at all */}
          {totalContracts === 0 && (
            <div className="p-8 bg-white border border-slate-100 rounded-3xl text-center space-y-3 shadow-xs">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xs">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                Shartnomalar mavjud emas
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                Platformada hali birorta shartnoma ro&apos;yxatdan o&apos;tkazilmagan.
                Birinchi shartnomani tuzib, hisob-kitoblarni boshlang.
              </p>
              <button
                type="button"
                onClick={() => onNavigateTab("contract")}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Birinchi shartnomani tuzish</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
