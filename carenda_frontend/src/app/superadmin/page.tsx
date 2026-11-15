"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  CheckCircle2,
  Clock,
  Snowflake,
  AlertCircle,
  Car,
  FileText,
  UserCheck,
  CreditCard,
  RefreshCw,
  ArrowRight,
  Check,
  X,
  Loader2,
  BellRing,
} from "lucide-react";
import {
  getSuperadminArendators,
  getSuperadminRequests,
  approveSuperadminRequest,
  rejectSuperadminRequest,
  triggerNotifications,
} from "@/lib/api";
import { SuperadminKpi, SubscriptionRequest } from "@/types/subscription";
import { formatUSD, formatDateTime, formatUzbekPhone } from "@/lib/utils";

export default function SuperadminDashboardPage() {
  const [kpi, setKpi] = useState<SuperadminKpi>({
    total: 0,
    standard: 0,
    free: 0,
    expired: 0,
    frozen: 0,
    pending_requests: 0,
    total_cars: 0,
    total_contracts: 0,
    active_contracts: 0,
    total_drivers: 0,
  });
  const [pendingRequests, setPendingRequests] = useState<SubscriptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [triggeringNotifs, setTriggeringNotifs] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadDashboardData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [arenRes, reqs] = await Promise.all([
        getSuperadminArendators({ forceRefresh: isRefresh }),
        getSuperadminRequests("pending"),
      ]);

      if (arenRes?.kpi) {
        setKpi(arenRes.kpi);
      }
      setPendingRequests(reqs || []);
    } catch (err: unknown) {
      showToast("error", "Ma'lumotlarni yuklashda xatolik yuz berdi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle Approve
  const handleApprove = async (id: number) => {
    try {
      setActionBusyId(id);
      await approveSuperadminRequest(id);
      showToast("success", "Obuna so'rovi muvaffaqiyatli tasdiqlandi!");
      loadDashboardData(true);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Tasdiqlashda xatolik yuz berdi.");
    } finally {
      setActionBusyId(null);
    }
  };

  // Handle Reject
  const handleReject = async (id: number) => {
    const reason = prompt("Rad etish sababini kiriting (ixtiyoriy):") || "";
    try {
      setActionBusyId(id);
      await rejectSuperadminRequest(id, reason);
      showToast("success", "Obuna so'rovi rad etildi.");
      loadDashboardData(true);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Rad etishda xatolik yuz berdi.");
    } finally {
      setActionBusyId(null);
    }
  };

  // Trigger Notifications
  const handleTriggerNotifications = async () => {
    try {
      setTriggeringNotifs(true);
      const res = await triggerNotifications();
      showToast("success", res.detail || "Bildirishnomalar muvaffaqiyatli yuborildi!");
    } catch (err: unknown) {
      showToast("error", "Bildirishnomalarni yuborishda xatolik yuz berdi.");
    } finally {
      setTriggeringNotifs(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-900 rounded-2xl border border-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">Platforma Umumiy Statistikasi</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Carenda platformasining barcha faoliyat ko&apos;rsatkichlari
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadDashboardData(true)}
            disabled={refreshing}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition active:scale-95 cursor-pointer disabled:opacity-50"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-amber-400" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleTriggerNotifications}
            disabled={triggeringNotifs}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-bold text-xs rounded-xl transition active:scale-95 cursor-pointer disabled:opacity-50"
            title="Muddati yaqinlashgan to'lov eslatmalarini Telegram bot orqali yuborish"
          >
            <BellRing className={`w-3.5 h-3.5 ${triggeringNotifs ? "animate-bounce text-amber-400" : ""}`} />
            <span>{triggeringNotifs ? "Yuborilmoqda..." : "Eslatmalarni yuborish"}</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (8 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Lessors */}
        <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Jami Arendatorlar</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{kpi.total}</div>
          <span className="text-[10px] text-slate-500 block">Ro&apos;yxatdan o&apos;tganlar</span>
        </div>

        {/* Standard Plans */}
        <div className="bg-slate-900/90 border border-emerald-900/40 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Standart Obunalar</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">{kpi.standard}</div>
          <span className="text-[10px] text-emerald-600/80 block">Faol pullik tarifda</span>
        </div>

        {/* Free Trial */}
        <div className="bg-slate-900/90 border border-blue-900/40 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Free (Sinov)</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-blue-400 font-mono">{kpi.free}</div>
          <span className="text-[10px] text-blue-500/80 block">Bepul sinov davrida</span>
        </div>

        {/* Expired / Frozen */}
        <div className="bg-slate-900/90 border border-amber-900/40 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Muddati tugagan / Muzlatilgan</span>
            <Snowflake className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {kpi.expired + kpi.frozen}
          </div>
          <span className="text-[10px] text-slate-500 block">
            {kpi.expired} tugagan • {kpi.frozen} muzlatilgan
          </span>
        </div>

        {/* Total Cars */}
        <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Jami Avtomobillar</span>
            <Car className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{kpi.total_cars || 0}</div>
          <span className="text-[10px] text-slate-500 block">Kiritilgan mashinalar</span>
        </div>

        {/* Total Contracts */}
        <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Shartnomalar</span>
            <FileText className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {kpi.active_contracts || 0}
            <span className="text-xs font-normal text-slate-500 ml-1">/ {kpi.total_contracts || 0}</span>
          </div>
          <span className="text-[10px] text-slate-500 block">Faol / Jami</span>
        </div>

        {/* Total Drivers / Renters */}
        <div className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Mijozlar (Haydovchilar)</span>
            <UserCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono">{kpi.total_drivers || 0}</div>
          <span className="text-[10px] text-slate-500 block">Biriktirilgan mijozlar</span>
        </div>

        {/* Pending Requests */}
        <div className="bg-slate-900/90 border border-amber-500/40 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Obuna So&apos;rovlari</span>
            <CreditCard className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {kpi.pending_requests}
          </div>
          <span className="text-[10px] text-amber-500/80 block">Tasdiqlash kutilmoqda</span>
        </div>
      </div>

      {/* Quick Action Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/superadmin/lessors"
          className="p-4 bg-gradient-to-r from-blue-950/70 to-slate-900 border border-blue-800/40 hover:border-blue-700/80 rounded-2xl transition flex items-center justify-between group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white group-hover:text-blue-300 transition">
                Arendatorlarni Boshqarish
              </h3>
              <p className="text-xs text-slate-400">
                Tarif biriktirish, muddatini uzaytirish, bloklash va monitoring
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-400 group-hover:translate-x-1 transition-transform" />
        </Link>

        <Link
          href="/superadmin/settings"
          className="p-4 bg-gradient-to-r from-indigo-950/70 to-slate-900 border border-indigo-800/40 hover:border-indigo-700/80 rounded-2xl transition flex items-center justify-between group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white group-hover:text-indigo-300 transition">
                Tarif va To&apos;lov Sozlamalari
              </h3>
              <p className="text-xs text-slate-400">
                Standart narxi, Free limitlar (3 mashina, 60 kun) va Paynet havolalari
              </p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>

      {/* Pending Subscription Requests Section */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-amber-400" />
            <h2 className="font-bold text-sm text-white">
              Kutilayotgan Obuna To&apos;lov So&apos;rovlari ({pendingRequests.length})
            </h2>
          </div>
          {pendingRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400">
              Kutilmoqda
            </span>
          )}
        </div>

        {pendingRequests.length === 0 ? (
          <div className="text-center py-8 text-slate-500 space-y-1">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/50 mb-1" />
            <p className="text-xs font-medium">Barcha to&apos;lov so&apos;rovlari ko&apos;rib chiqilgan</p>
            <p className="text-[11px] text-slate-600">
              Yangi to&apos;lov cheki kelganda ushbu bo&apos;limda ko&apos;rinadi
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm text-white">
                      {req.user_name}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Standart Obuna (+30 kun)
                    </span>
                    {req.amount && (
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {Number(req.amount).toLocaleString("uz-UZ")} UZS
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>📞 {req.user_phone ? formatUzbekPhone(req.user_phone, false) : "Raqam yo'q"}</span>
                    <span>•</span>
                    <span className="text-[11px] text-slate-500">{formatDateTime(req.created_at)}</span>
                  </div>
                  {req.note && (
                    <p className="text-xs text-slate-400 italic bg-slate-900/60 p-2 rounded-lg mt-1">
                      &quot;{req.note}&quot;
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                  <button
                    type="button"
                    disabled={actionBusyId === req.id}
                    onClick={() => handleReject(req.id)}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-bold transition active:scale-95 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Rad etish</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionBusyId === req.id}
                    onClick={() => handleApprove(req.id)}
                    className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition active:scale-95 cursor-pointer flex items-center gap-1 disabled:opacity-50 shadow-xs"
                  >
                    {actionBusyId === req.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Tasdiqlash</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
