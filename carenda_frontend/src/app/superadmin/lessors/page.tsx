"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Users,
  Search,
  CheckCircle2,
  Clock,
  Snowflake,
  AlertCircle,
  Phone,
  Play,
  Plus,
  Shield,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Car,
  FileText,
} from "lucide-react";
import {
  getSuperadminArendators,
  grantArendatorSubscription,
  toggleArendatorFreeze,
  toggleArendatorMonitoring,
} from "@/lib/api";
import { SuperadminArendatorItem, SuperadminKpi } from "@/types/subscription";
import { formatUzbekPhone, initiatePhoneCall } from "@/lib/utils";

type ArendatorFilter = "all" | "standard" | "free" | "expired" | "frozen";

export default function SuperadminLessorsPage() {
  const [arendators, setArendators] = useState<SuperadminArendatorItem[]>([]);
  const [kpi, setKpi] = useState<SuperadminKpi>({
    total: 0,
    standard: 0,
    free: 0,
    expired: 0,
    frozen: 0,
    pending_requests: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<ArendatorFilter>("all");
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);

  // Extend Subscription Modal
  const [selectedLessorForExtend, setSelectedLessorForExtend] = useState<SuperadminArendatorItem | null>(null);
  const [extendDays, setExtendDays] = useState(30);

  // Toast
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadLessors = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await getSuperadminArendators({
        search: searchQuery,
        filter: filterTab,
        forceRefresh: isRefresh,
      });
      if (res?.arendators) {
        setArendators(res.arendators);
      }
      if (res?.kpi) {
        setKpi(res.kpi);
      }
    } catch (err: unknown) {
      showToast("error", "Arendatorlar ro'yxatini yuklashda xatolik yuz berdi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, filterTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLessors();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadLessors]);

  // Toggle Freeze
  const handleToggleFreeze = async (arendator: SuperadminArendatorItem) => {
    try {
      setActionBusyId(arendator.id);
      const res = await toggleArendatorFreeze(arendator.id);
      showToast(
        "success",
        res.detail ||
          (arendator.is_frozen
            ? "Arendator muzlatishdan chiqarildi."
            : "Arendator hisobi muzlatildi.")
      );
      loadLessors(true);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Xatolik yuz berdi.");
    } finally {
      setActionBusyId(null);
    }
  };

  // Toggle Monitoring
  const handleToggleMonitoring = async (arendator: SuperadminArendatorItem) => {
    try {
      setActionBusyId(arendator.id);
      const res = await toggleArendatorMonitoring(arendator.id);
      showToast("success", res.detail || "Monitoring ruxsati yangilandi.");
      loadLessors(true);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Xatolik yuz berdi.");
    } finally {
      setActionBusyId(null);
    }
  };

  // Grant Subscription
  const handleGrantSubscription = async () => {
    if (!selectedLessorForExtend) return;
    try {
      setActionBusyId(selectedLessorForExtend.id);
      const res = await grantArendatorSubscription(selectedLessorForExtend.id, extendDays);
      showToast("success", res.detail || `Standart obuna ${extendDays} kunga faollashtirildi!`);
      setSelectedLessorForExtend(null);
      loadLessors(true);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Obunani uzaytirishda xatolik.");
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
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

      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white">Arendatorlar Boshqaruvi</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Ro&apos;yxatdan o&apos;tgan barcha arendatorlar hisobi va obunalari
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadLessors(true)}
          disabled={refreshing}
          className="self-end sm:self-auto p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition active:scale-95 cursor-pointer disabled:opacity-50"
          title="Yangilash"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-amber-400" : ""}`} />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Ism, telefon, username yoki tenant kodi bo'yicha qidirish..."
          className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500/60 transition"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {(
          [
            { id: "all", label: "Barchasi", count: kpi.total },
            { id: "standard", label: "Standart", count: kpi.standard },
            { id: "free", label: "Free (Sinov)", count: kpi.free },
            { id: "expired", label: "Muddati tugagan", count: kpi.expired },
            { id: "frozen", label: "Muzlatilgan", count: kpi.frozen },
          ] as const
        ).map((tab) => {
          const isActive = filterTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer active:scale-95 ${
                isActive
                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800/80"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? "bg-amber-500/20 text-amber-300" : "bg-slate-800 text-slate-400"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Arendator List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-slate-900 rounded-2xl border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : arendators.length === 0 ? (
        <div className="text-center py-16 text-slate-500 bg-slate-900/40 rounded-3xl border border-slate-800/60 space-y-2">
          <Users className="w-10 h-10 mx-auto text-slate-600 mb-1" />
          <h3 className="font-bold text-sm text-slate-300">Arendatorlar topilmadi</h3>
          <p className="text-xs text-slate-500">
            Qidiruv so&apos;rovi yoki tanlangan filtr bo&apos;yicha hech qanday natija yo&apos;q
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {arendators.map((a) => {
            const isBusy = actionBusyId === a.id;
            const isStandard = a.plan === "standard";
            const canMonitor = a.can_monitor_renters !== false;

            return (
              <div
                key={a.id}
                className={`p-4 bg-slate-900/90 rounded-2xl border transition space-y-3 ${
                  a.is_frozen
                    ? "border-rose-900/60 bg-rose-950/10"
                    : !a.is_subscription_active
                    ? "border-amber-900/40"
                    : "border-slate-800/90"
                }`}
              >
                {/* Lessor Header Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/70 pb-3">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-extrabold text-sm text-white capitalize truncate">
                        {a.full_name || a.username || "Arendator"}
                      </h3>
                      {a.tenant_code && (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                          {a.tenant_code}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          a.is_frozen
                            ? "bg-rose-500/20 text-rose-300"
                            : a.is_subscription_active
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {a.is_frozen
                          ? "Muzlatilgan"
                          : a.is_subscription_active
                          ? isStandard
                            ? "Standart (Faol)"
                            : "Free (Sinov)"
                          : "Muddati tugagan"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      {a.phone && (
                        <button
                          type="button"
                          onClick={() => initiatePhoneCall(a.phone)}
                          className="hover:text-white transition flex items-center gap-1 cursor-pointer"
                        >
                          <Phone className="w-3 h-3 text-emerald-400" />
                          <span className="font-mono">{formatUzbekPhone(a.phone, false)}</span>
                        </button>
                      )}
                      {a.username && (
                        <a
                          href={`https://t.me/${a.username}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-blue-400 transition"
                        >
                          @{a.username}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Quick stats badges */}
                  <div className="flex items-center gap-2 text-xs">
                    <div className="px-2.5 py-1 bg-slate-800/80 rounded-xl text-slate-300 flex items-center gap-1.5 font-medium">
                      <Car className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{a.cars_count} ta avto</span>
                    </div>
                    <div className="px-2.5 py-1 bg-slate-800/80 rounded-xl text-slate-300 flex items-center gap-1.5 font-medium">
                      <FileText className="w-3.5 h-3.5 text-teal-400" />
                      <span>{a.active_contracts_count} faol</span>
                    </div>
                  </div>
                </div>

                {/* Subscription Details Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="text-slate-400">
                    <span>Obuna muddati: </span>
                    <b className="text-slate-200">
                      {a.expires_date || "Belgilanmagan"}
                    </b>
                    {a.days_delta !== undefined && a.is_subscription_active && (
                      <span className="text-[11px] text-emerald-400 ml-1.5">
                        ({a.days_delta} kun qoldi)
                      </span>
                    )}
                  </div>

                  {/* Monitoring status indicator */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Mijozlar monitoringi:</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        canMonitor
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {canMonitor ? "Yoqilgan" : "O'chirilgan"}
                    </span>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {/* Extend Subscription */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setSelectedLessorForExtend(a)}
                    className="flex-1 min-w-[140px] py-2 px-3 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tarif biriktirish / Uzaytirish</span>
                  </button>

                  {/* Toggle Monitoring */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleMonitoring(a)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                      canMonitor
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                        : "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40"
                    }`}
                    title="Mijozlar monitoringini yoqish yoki o'chirish"
                  >
                    {canMonitor ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        <span>Monitoringni o&apos;chirish</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Monitoringni yoqish</span>
                      </>
                    )}
                  </button>

                  {/* Toggle Freeze */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleFreeze(a)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                      a.is_frozen
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500"
                        : "bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/30"
                    }`}
                  >
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : a.is_frozen ? (
                      <Play className="w-3.5 h-3.5" />
                    ) : (
                      <Snowflake className="w-3.5 h-3.5" />
                    )}
                    <span>{a.is_frozen ? "Muzlatishdan chiqarish" : "Bloklash"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Extend Modal */}
      {selectedLessorForExtend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setSelectedLessorForExtend(null)}
          />
          <div className="relative bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-5 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="font-extrabold text-base text-white">
                Tarif biriktirish / Uzaytirish
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedLessorForExtend.full_name || selectedLessorForExtend.username}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Muddatni tanlang:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[30, 90, 365].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setExtendDays(d)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition cursor-pointer active:scale-95 ${
                      extendDays === d
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                  >
                    {d === 30 ? "+1 oy (30 kun)" : d === 90 ? "+3 oy" : "+1 yil"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={actionBusyId !== null}
                onClick={handleGrantSubscription}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionBusyId !== null ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Standart tarifni faollashtirish</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLessorForExtend(null)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
