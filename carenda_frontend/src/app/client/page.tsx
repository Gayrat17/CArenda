"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  Phone,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  User as UserIcon,
  Shield,
  FileSpreadsheet,
  Check,
  ChevronRight,
  TrendingUp,
  CreditCard,
  History,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { getClientDashboard, downloadClientContractExcel } from "@/lib/api";
import {
  ClientContract,
  ClientDashboardResponse,
  ClientPaymentScheduleItem,
} from "@/types/fleet";
import {
  formatUSD,
  formatDate,
  cleanPhoneNumber,
  initiatePhoneCall,
} from "@/lib/utils";

export default function ClientPortalPage() {
  const router = useRouter();

  const [data, setData] = useState<ClientDashboardResponse | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"schedule" | "history">("schedule");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  // Fetch client dashboard
  const loadDashboard = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await getClientDashboard({ forceRefresh });
      if (!res?.client?.is_onboarded) {
        router.replace("/login");
        return;
      }

      setData(res);
      if (res.contracts.length > 0 && !selectedContractId) {
        setSelectedContractId(res.contracts[0].id);
      }
    } catch (err: unknown) {
      console.error("Failed to load client portal dashboard:", err);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("403") || msg.includes("huquqi yo'q") || msg.includes("onboarding")) {
        router.replace("/login");
        return;
      }
      setError("Ma'lumotlarni yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, selectedContractId]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready?.();
      window.Telegram.WebApp.expand?.();
    }
    loadDashboard();
  }, [loadDashboard]);

  // Selected contract
  const activeContract = useMemo(() => {
    if (!data?.contracts?.length) return null;
    return (
      data.contracts.find((c) => c.id === selectedContractId) ||
      data.contracts[0]
    );
  }, [data?.contracts, selectedContractId]);

  // Progress metrics for active contract
  const metrics = useMemo(() => {
    if (!activeContract) return null;
    const totalAmount = parseFloat(activeContract.total_amount || "0") || 0;
    const paidTotal = parseFloat(activeContract.paid_total_usd || "0") || 0;
    const remainingTotal = parseFloat(activeContract.remaining_total_usd || "0") || 0;

    const percentPaid =
      totalAmount > 0
        ? Math.min(100, Math.max(0, Math.round((paidTotal / totalAmount) * 100)))
        : 0;

    const paidMonthsCount = activeContract.payments.filter(
      (p) => p.status === "paid"
    ).length;

    return {
      totalAmount,
      paidTotal,
      remainingTotal,
      percentPaid,
      paidMonthsCount,
      totalMonths: activeContract.months_count,
    };
  }, [activeContract]);

  // Next payment for active contract
  const nextPaymentForActive = useMemo(() => {
    if (!activeContract) return null;
    const pendingList = activeContract.payments.filter(
      (p) => p.status === "pending" || p.status === "partial"
    );
    if (!pendingList.length) return null;
    const p = pendingList[0];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(p.due_date);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      monthNumber: p.month_number,
      dueDate: p.due_date,
      amount: p.remaining_amount,
      diffDays,
      isOverdue: diffDays < 0,
      isToday: diffDays === 0,
      daysOverdue: Math.max(0, -diffDays),
    };
  }, [activeContract]);

  // Payment history (paid or partially paid)
  const paymentHistory = useMemo(() => {
    if (!activeContract) return [];
    return activeContract.payments.filter(
      (p) => parseFloat(p.paid_amount || "0") > 0 || p.status === "paid"
    );
  }, [activeContract]);

  // Handle Excel download
  const handleDownloadExcel = async () => {
    if (!activeContract) return;
    try {
      setDownloadingExcel(true);
      await downloadClientContractExcel(
        activeContract.id,
        `shartnoma_${activeContract.plate_number.replace(/\s+/g, "")}.xlsx`
      );
    } catch (err: unknown) {
      alert("Excel hisobotini yuklab olishda xatolik yuz berdi.");
    } finally {
      setDownloadingExcel(false);
    }
  };

  // SKELETON LOADER
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-4 max-w-md mx-auto space-y-4">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between pt-2 pb-1">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-slate-200 rounded-md animate-pulse" />
            <div className="h-5 w-48 bg-slate-200 rounded-md animate-pulse" />
          </div>
          <div className="w-10 h-10 rounded-2xl bg-slate-200 animate-pulse" />
        </div>

        {/* Hero Card Skeleton */}
        <div className="h-40 bg-slate-200 rounded-3xl animate-pulse" />

        {/* Car Card Skeleton */}
        <div className="h-44 bg-slate-200 rounded-3xl animate-pulse" />

        {/* Timeline Skeleton */}
        <div className="space-y-2.5 pt-2">
          <div className="h-16 bg-slate-200 rounded-2xl animate-pulse" />
          <div className="h-16 bg-slate-200 rounded-2xl animate-pulse" />
          <div className="h-16 bg-slate-200 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  // ERROR STATE
  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mb-3 shadow-xs">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1">
          Ma&apos;lumotlarni yuklab bo&apos;lmadi
        </h2>
        <p className="text-xs text-slate-500 mb-5 leading-relaxed">{error}</p>
        <button
          type="button"
          onClick={() => loadDashboard(true)}
          className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
        >
          Qayta urinish
        </button>
      </div>
    );
  }

  // EMPTY STATE: No contracts
  if (!data?.contracts?.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto">
        {/* Header */}
        <div className="pt-3 flex items-center justify-between border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-900">Carenda</h1>
              <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wide">
                Mijoz Portali
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl transition active:scale-95 cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="text-center py-16 px-4 space-y-3">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xs">
            <Car className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Faol shartnoma topilmadi
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            Hurmatli <span className="font-semibold text-slate-800">{data?.client?.full_name}</span>, sizning hisobingizga biriktirilgan faol avtomobil shartnomasi topilmadi.
          </p>
          <div className="pt-2">
            <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl text-amber-800 text-xs text-left leading-relaxed">
              💡 <b>Maslahat:</b> Arendatoringizdan shartnoma maxsus kodini (<code className="font-mono font-bold bg-white px-1 py-0.5 rounded border border-amber-200">CR4829</code>) so&apos;rang va tizimga qayta kirib biriktiring.
            </div>
          </div>
        </div>

        <div className="text-center py-2 text-[11px] text-slate-400">
          Carenda v2.0 • Mijoz Shaxsiy Kabineti
        </div>
      </div>
    );
  }

  const client = data.client;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16 pt-3 px-3 sm:px-4 max-w-md mx-auto space-y-3.5">
      {/* Top Header */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 font-medium">Assalomu alaykum,</span>
              </div>
              <h1 className="text-base font-black text-slate-900 truncate capitalize">
                {client.full_name}
              </h1>
              {client.phone && (
                <span className="text-[10px] text-slate-500 font-mono font-bold block">
                  {client.phone}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadDashboard(true)}
            className="p-2.5 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-2xl transition active:scale-95 cursor-pointer shrink-0"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
          </button>
        </div>

        {/* Arendator Contact Bar */}
        {activeContract && (
          <div className="flex items-center justify-between bg-blue-50/70 border border-blue-100 px-3.5 py-2.5 rounded-2xl">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="w-4 h-4 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 block font-medium leading-none">
                  Arendator (Avto egasi)
                </span>
                <span className="text-xs font-bold text-slate-800 truncate block mt-0.5 capitalize">
                  {activeContract.owner_name}
                </span>
              </div>
            </div>

            {activeContract.owner_phone && (
              <button
                type="button"
                onClick={() => initiatePhoneCall(activeContract.owner_phone)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Qo&apos;ng&apos;iroq</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Multi-Contract Horizontal Pill Selector (if client has > 1 contract) */}
      {data.contracts.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {data.contracts.map((c) => {
            const isSelected = c.id === selectedContractId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedContractId(c.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-bold transition whitespace-nowrap cursor-pointer active:scale-95 ${
                  isSelected
                    ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <Car className="w-3.5 h-3.5" />
                <span>{c.car_name}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {c.plate_number}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Next Payment Hero Banner */}
      {nextPaymentForActive ? (
        <div
          className={`p-4 sm:p-5 rounded-3xl border shadow-xs space-y-3 transition-all ${
            nextPaymentForActive.isOverdue
              ? "bg-rose-50 border-rose-200 text-rose-950"
              : nextPaymentForActive.isToday
              ? "bg-amber-50 border-amber-200 text-amber-950"
              : "bg-gradient-to-br from-blue-600 to-indigo-700 border-blue-600 text-white shadow-blue-500/15"
          }`}
        >
          {/* Status Label */}
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                nextPaymentForActive.isOverdue
                  ? "bg-rose-200/70 text-rose-800"
                  : nextPaymentForActive.isToday
                  ? "bg-amber-200/70 text-amber-900"
                  : "bg-white/20 text-white"
              }`}
            >
              {nextPaymentForActive.isOverdue
                ? "⚠️ To'lov kechikkan"
                : nextPaymentForActive.isToday
                ? "📌 To'lov kuni: BUGUN"
                : "Keyingi to'lov"}
            </span>

            <span
              className={`text-xs font-semibold ${
                nextPaymentForActive.isOverdue
                  ? "text-rose-700"
                  : nextPaymentForActive.isToday
                  ? "text-amber-800"
                  : "text-blue-100"
              }`}
            >
              {nextPaymentForActive.monthNumber}-oy to&apos;lovi
            </span>
          </div>

          {/* Amount & Due Date */}
          <div className="flex items-baseline justify-between pt-1">
            <div>
              <span
                className={`text-xs font-medium block ${
                  nextPaymentForActive.isOverdue
                    ? "text-rose-700"
                    : nextPaymentForActive.isToday
                    ? "text-amber-800"
                    : "text-blue-200"
                }`}
              >
                To&apos;lov summasi
              </span>
              <h2 className="text-3xl font-black tracking-tight font-mono">
                {formatUSD(nextPaymentForActive.amount)}
              </h2>
            </div>
            <div className="text-right">
              <span
                className={`text-xs font-medium block ${
                  nextPaymentForActive.isOverdue
                    ? "text-rose-700"
                    : nextPaymentForActive.isToday
                    ? "text-amber-800"
                    : "text-blue-200"
                }`}
              >
                Muddati
              </span>
              <span className="text-sm font-bold font-mono">
                {formatDate(nextPaymentForActive.dueDate)}
              </span>
            </div>
          </div>

          {/* Alert / Advice Text */}
          <div
            className={`p-2.5 rounded-2xl text-xs font-medium leading-relaxed ${
              nextPaymentForActive.isOverdue
                ? "bg-rose-100/70 text-rose-900 border border-rose-200"
                : nextPaymentForActive.isToday
                ? "bg-amber-100/70 text-amber-900 border border-amber-200"
                : "bg-white/10 text-blue-50 border border-white/15"
            }`}
          >
            {nextPaymentForActive.isOverdue ? (
              <span>
                To&apos;lov <b>{nextPaymentForActive.daysOverdue} kunga kechikdi</b>. Noqulayliklar bo&apos;lmasligi uchun arendatoringiz bilan bog&apos;lanib to&apos;lovni amalga oshiring.
              </span>
            ) : nextPaymentForActive.isToday ? (
              <span>
                Bugun to&apos;lovning oxirgi kuni. Iltimos, oylik to&apos;lovni kechiktirmasdan topshiring.
              </span>
            ) : (
              <span>
                Keyingi to&apos;lovga <b>{nextPaymentForActive.diffDays} kun</b> qoldi.
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Completed all payments banner */
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-3xl text-emerald-950 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Barcha to&apos;lovlar yopilgan!</h3>
            <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
              Ushbu shartnoma bo&apos;yicha qarzdorlik mavjud emas.
            </p>
          </div>
        </div>
      )}

      {/* Car & Contract Progress Card */}
      {activeContract && metrics && (
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
          {/* Car Header Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                Mening Avtomobilim
              </span>
              <h3 className="text-base font-extrabold text-slate-900 truncate">
                {activeContract.car_name}{" "}
                {activeContract.car_year && (
                  <span className="text-xs font-normal text-slate-400">
                    ({activeContract.car_year})
                  </span>
                )}
              </h3>
            </div>

            {/* License plate badge */}
            <div className="flex items-center border-2 border-slate-800 rounded-lg overflow-hidden bg-white shadow-2xs shrink-0 font-mono font-bold text-xs">
              <div className="bg-slate-100 px-1.5 py-1 text-slate-700 border-r border-slate-300 flex items-center">
                UZ
              </div>
              <div className="px-2 py-1 tracking-wider text-slate-900">
                {activeContract.plate_number}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">
                To&apos;lov jarayoni
              </span>
              <span className="font-extrabold text-blue-600 font-mono">
                {metrics.percentPaid}% to&apos;landi
              </span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${metrics.percentPaid}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-400 pt-0.5">
              <span>{metrics.paidMonthsCount} oy to&apos;langan</span>
              <span>Jami {metrics.totalMonths} oy</span>
            </div>
          </div>

          {/* Financial Breakdown (3 Columns) */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
            <div className="p-2.5 bg-slate-50 rounded-2xl text-center">
              <span className="text-[10px] text-slate-400 block font-medium">Jami</span>
              <span className="text-xs font-bold text-slate-900 font-mono mt-0.5 block truncate">
                {formatUSD(metrics.totalAmount)}
              </span>
            </div>
            <div className="p-2.5 bg-emerald-50 rounded-2xl text-center border border-emerald-100">
              <span className="text-[10px] text-emerald-600 block font-medium">To&apos;landi</span>
              <span className="text-xs font-extrabold text-emerald-700 font-mono mt-0.5 block truncate">
                {formatUSD(metrics.paidTotal)}
              </span>
            </div>
            <div className="p-2.5 bg-blue-50 rounded-2xl text-center border border-blue-100">
              <span className="text-[10px] text-blue-600 block font-medium">Qoldiq</span>
              <span className="text-xs font-extrabold text-blue-900 font-mono mt-0.5 block truncate">
                {formatUSD(metrics.remainingTotal)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tabs: To'lov jadvali | To'lovlar tarixi */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="flex border-b border-slate-100 p-1.5 bg-slate-50/70 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-2xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "schedule"
                ? "bg-white text-blue-600 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>To&apos;lov jadvali</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-2xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "history"
                ? "bg-white text-blue-600 shadow-2xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>To&apos;lovlar tarixi ({paymentHistory.length})</span>
          </button>
        </div>

        {/* Tab 1 Content: Full Installment Schedule */}
        {activeTab === "schedule" && activeContract && (
          <div className="p-3 sm:p-4 space-y-2">
            {activeContract.payments.map((p) => {
              const isPaid = p.status === "paid";
              const isPartial = p.status === "partial";
              const isOverdue = !isPaid && p.days_overdue > 0;

              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    isPaid
                      ? "bg-emerald-50/40 border-emerald-100/80"
                      : isOverdue
                      ? "bg-rose-50/50 border-rose-200"
                      : "bg-white border-slate-100 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                        isPaid
                          ? "bg-emerald-100 text-emerald-700"
                          : isOverdue
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {p.month_number}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 font-mono">
                          {formatUSD(p.expected_amount)}
                        </span>
                        {isPaid && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            To&apos;langan
                          </span>
                        )}
                        {isPartial && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            Qisman
                          </span>
                        )}
                        {isOverdue && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                            {p.days_overdue} kun kechikkan
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 block font-medium mt-0.5">
                        Sana: {formatDate(p.due_date)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {isPaid ? (
                      <span className="text-xs font-bold text-emerald-600 font-mono">
                        {formatUSD(p.paid_amount)}
                      </span>
                    ) : (
                      <span className="text-xs font-extrabold text-slate-900 font-mono">
                        {formatUSD(p.remaining_amount)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2 Content: Payment History */}
        {activeTab === "history" && (
          <div className="p-3 sm:p-4 space-y-2">
            {paymentHistory.length === 0 ? (
              <div className="text-center py-10 text-slate-400 space-y-1">
                <Clock className="w-8 h-8 mx-auto text-slate-300 mb-1" />
                <p className="text-xs font-medium">Hozircha qabul qilingan to&apos;lovlar yo&apos;q</p>
                <p className="text-[11px] text-slate-400">
                  Arendator to&apos;lov kiritganda ushbu bo&apos;limda aks etadi.
                </p>
              </div>
            ) : (
              paymentHistory.map((p) => (
                <div
                  key={p.id}
                  className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 block truncate">
                        {p.month_number}-oy to&apos;lovi
                      </span>
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {p.paid_at ? formatDate(p.paid_at) : formatDate(p.due_date)}
                      </span>
                      {p.comment && (
                        <span className="text-[10px] text-slate-500 italic block mt-0.5 truncate">
                          &quot;{p.comment}&quot;
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-emerald-700 font-mono">
                      +{formatUSD(p.paid_amount)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Excel Download Button */}
      {activeContract && (
        <button
          type="button"
          onClick={handleDownloadExcel}
          disabled={downloadingExcel}
          className="w-full py-3.5 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs rounded-2xl shadow-2xs transition active:scale-98 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>
            {downloadingExcel
              ? "Excel yuklanmoqda..."
              : "Shartnoma to'lov jadvalini yuklab olish (Excel)"}
          </span>
        </button>
      )}

      {/* Footer Info */}
      <div className="text-center pt-2 text-[11px] text-slate-400 font-medium">
        Carenda v2.0 • Mijoz Shaxsiy Portali
      </div>
    </div>
  );
}
