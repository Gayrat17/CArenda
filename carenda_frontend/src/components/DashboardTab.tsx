"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  DollarSign,
  AlertCircle,
  Clock,
  Phone,
  CheckCircle2,
  ShieldCheck,
  Car,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
} from "lucide-react";
import { DashboardResponse, OverduePaymentItem, User } from "@/types/fleet";
import { formatDate, formatUSD } from "@/lib/utils";
import { downloadExcelReport } from "@/lib/api";
import { resolveUserIdentity } from "@/lib/identity";

interface DashboardTabProps {
  user: User | null;
  dashboard: DashboardResponse | null;
  loading: boolean;
  onPaymentClick: (payment: OverduePaymentItem) => void;
  onRefresh: () => void;
  onNavigateTab: (tab: "dashboard" | "cars" | "contract" | "settings") => void;
}

export function DashboardTab({
  user,
  dashboard,
  loading,
  onPaymentClick,
  onNavigateTab,
}: DashboardTabProps) {
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyTenantCode = async () => {
    if (!user?.tenant_code) return;
    try {
      await navigator.clipboard.writeText(user.tenant_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloadingExcel(true);
      await downloadExcelReport();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Excel hisobotini yuklab olishda xatolik.");
    } finally {
      setDownloadingExcel(false);
    }
  };

  const overdueList = dashboard?.overdue_payments || [];
  const identity = resolveUserIdentity(user);

  return (
    <div className="space-y-4">
      {/* Top Header & User Overview */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider block">
              Carenda Platformasi
            </span>

            {/* Line 1 (Primary): Profile Name + Role Badge + Tenant Code */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-slate-900 leading-tight">
                {identity.fullName}
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-100 text-blue-800 rounded-md">
                {user?.role === "superadmin" ? "Super Admin" : "Arendator"}
              </span>
              {user?.tenant_code && (
                <button
                  type="button"
                  onClick={handleCopyTenantCode}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-mono font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition active:scale-95"
                  title="Arendator kodi (nusxalash uchun bosing)"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{user.tenant_code}</span>
                </button>
              )}
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

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="px-2.5 py-0.5 text-xs font-semibold uppercase bg-blue-100 text-blue-800 rounded-full">
              {user?.plan || "Trial"}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              {user?.cars_count || 0} / {user?.cars_limit || 0} mashina
            </span>
          </div>
        </div>

        {/* Fleet Status Summary Pill */}
        <div
          onClick={() => onNavigateTab("cars")}
          className="cursor-pointer grid grid-cols-3 gap-2 p-2 bg-slate-50 rounded-2xl border border-slate-100/80 text-center text-xs"
        >
          <div className="p-1.5 rounded-xl bg-white border border-slate-100/60 shadow-xs">
            <p className="text-[10px] text-slate-500">Bo'sh</p>
            <p className="text-sm font-bold text-emerald-600">
              {dashboard?.available_cars || 0}
            </p>
          </div>
          <div className="p-1.5 rounded-xl bg-white border border-slate-100/60 shadow-xs">
            <p className="text-[10px] text-slate-500">Ijarada</p>
            <p className="text-sm font-bold text-blue-600">
              {dashboard?.rented_cars || 0}
            </p>
          </div>
          <div className="p-1.5 rounded-xl bg-white border border-slate-100/60 shadow-xs">
            <p className="text-[10px] text-slate-500">Ta'mirda</p>
            <p className="text-sm font-bold text-amber-600">
              {dashboard?.maintenance_cars || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Financial KPI Cards or Inline Skeleton */}
      {!dashboard ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-28 bg-white/70 border border-slate-100 rounded-3xl p-5 shadow-xs flex flex-col justify-between">
            <div className="h-4 bg-slate-200 rounded w-1/3" />
            <div className="h-7 bg-slate-200 rounded w-1/2" />
            <div className="h-3 bg-slate-200 rounded w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="h-20 bg-white/70 border border-slate-100 rounded-2xl p-4 shadow-xs space-y-2">
              <div className="h-3 bg-slate-200 rounded w-2/3" />
              <div className="h-5 bg-slate-200 rounded w-1/2" />
            </div>
            <div className="h-20 bg-white/70 border border-slate-100 rounded-2xl p-4 shadow-xs space-y-2">
              <div className="h-3 bg-slate-200 rounded w-2/3" />
              <div className="h-5 bg-slate-200 rounded w-1/2" />
            </div>
          </div>
          <div className="h-10 bg-emerald-50/50 border border-emerald-100 rounded-2xl" />
          <div className="space-y-2 pt-2">
            <div className="h-5 w-44 bg-slate-200 rounded-md" />
            <div className="h-24 bg-white/70 border border-slate-100 rounded-2xl p-4" />
          </div>
        </div>
      ) : (
        <>
          {/* Financial KPI Cards */}
          <div className="grid grid-cols-1 gap-2.5">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-5 rounded-3xl shadow-sm space-y-1">
              <div className="flex items-center justify-between text-blue-100 text-xs font-medium">
                <span>Olingan tushum (Jami)</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              </div>
              <p className="text-2xl font-black tracking-tight">
                {formatUSD(dashboard.total_collected_usd)}
              </p>
              <div className="flex justify-between items-center text-[11px] text-blue-100/80 pt-2 border-t border-white/10">
                <span>Kutilayotgan: {formatUSD(dashboard.total_expected_usd)}</span>
                <span>Faol shartnomalar: {dashboard.active_contracts_count || 0} ta</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Qolgan qarz</span>
                  <DollarSign className="w-3.5 h-3.5 text-rose-500" />
                </div>
                <p className="text-lg font-bold text-rose-600">
                  {formatUSD(dashboard.total_remaining_usd)}
                </p>
                <p className="text-[10px] text-slate-400">Shartnomalar bo'yicha</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-1">
                <div className="flex items-center justify-between text-slate-500 text-xs">
                  <span>Jami mashinalar</span>
                  <Car className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <p className="text-lg font-bold text-slate-900">
                  {dashboard.total_cars || 0} ta
                </p>
                <p className="text-[10px] text-slate-400">Parkdagi avtomobillar</p>
              </div>
            </div>

            {/* Excel Export Button */}
            <button
              onClick={handleDownloadExcel}
              disabled={downloadingExcel}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-2xl text-xs font-semibold transition disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              {downloadingExcel ? "Excel tayyorlanmoqda..." : "📥 Excel (.xlsx) hisobotini yuklab olish"}
            </button>
          </div>

          {/* Overdue / Due Today Payments Section */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  🚨 Qarzdorlar va To'lovlar
                </h2>
                {overdueList.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-rose-100 text-rose-700 rounded-full">
                    {overdueList.length} ta
                  </span>
                )}
              </div>
            </div>

            {overdueList.length === 0 ? (
              <div className="p-6 bg-white border border-slate-100 rounded-3xl text-center space-y-2 shadow-xs">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-slate-900 text-sm">
                  Qarzdorliklar mavjud emas
                </h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Barcha to'lovlar o'z vaqtida amalga oshirilgan.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {overdueList.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 bg-white border border-rose-100/80 rounded-2xl shadow-xs flex flex-col gap-3 transition hover:border-rose-300"
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
                        <p className="text-xs text-slate-600 font-medium">
                          👤 {item.driver_name}
                        </p>
                      </div>

                      <div className="flex flex-col items-end">
                        <span className="text-xs font-bold text-rose-600">
                          {formatUSD(item.remaining_amount)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          kutilmoqda
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-50 flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-rose-600 font-medium">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Muddati: {formatDate(item.due_date)} (
                          {item.days_overdue} kun kechikdi)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.driver_phone && (
                          <a
                            href={`tel:${item.driver_phone}`}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200/60 transition"
                            title="Qo'ng'iroq qilish"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => onPaymentClick(item)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-lg shadow-xs text-xs transition"
                        >
                          To'lov qabul qilish
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
