"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  CreditCard,
  AlertCircle,
  Loader2,
  Phone,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Shield,
  Snowflake,
  Upload,
  Users,
  X,
  Zap,
  Car,
} from "lucide-react";
import {
  approveSuperadminRequest,
  getBootstrap,
  getSuperadminArendators,
  getSuperadminRequests,
  getSuperadminSettings,
  grantArendatorSubscription,
  rejectSuperadminRequest,
  toggleArendatorFreeze,
  updateSuperadminSettings,
} from "@/lib/api";
import { User } from "@/types/fleet";
import {
  SubscriptionRequest,
  SuperadminArendatorItem,
  SuperadminKpi,
} from "@/types/subscription";
import { cleanPhoneNumber, formatDate, formatDateTime, initiatePhoneCall } from "@/lib/utils";

type SuperadminTab = "arendators" | "settings" | "requests";
type ArendatorFilter = "all" | "standard" | "free" | "expired" | "frozen";
type RequestFilter = "pending" | "approved" | "rejected" | "all";

export default function SuperadminDashboardPage() {
  const router = useRouter();

  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<SuperadminTab>("arendators");

  // Toast Feedback
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const showToast = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Tab 1: Arendators State
  const [kpi, setKpi] = useState<SuperadminKpi>({
    total: 0,
    standard: 0,
    free: 0,
    expired: 0,
    frozen: 0,
    pending_requests: 0,
  });
  const [arendators, setArendators] = useState<SuperadminArendatorItem[]>([]);
  const [loadingArendators, setLoadingArendators] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<ArendatorFilter>("all");
  const [actionBusyId, setActionBusyId] = useState<number | null>(null);

  // Tab 2: Settings State
  const [standartPrice, setStandartPrice] = useState("150000");
  const [freeDurationDays, setFreeDurationDays] = useState("60");
  const [freeMaxContracts, setFreeMaxContracts] = useState("3");
  const [paynetUrl, setPaynetUrl] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [supportTelegram, setSupportTelegram] = useState("");
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Tab 3: Subscription Requests State
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("pending");
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestBusyId, setRequestBusyId] = useState<number | null>(null);

  // Load Arendators
  const fetchArendators = useCallback(
    async (searchVal = searchQuery, filterVal = filterTab) => {
      try {
        setLoadingArendators(true);
        const res = await getSuperadminArendators({
          search: searchVal,
          filter: filterVal,
          forceRefresh: true,
        });
        setKpi(res.kpi);
        setArendators(res.arendators);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Ma'lumotlarni yuklashda xatolik.";
        if (msg.includes("403")) {
          router.replace("/");
          return;
        }
        showToast("error", msg);
      } finally {
        setLoadingArendators(false);
      }
    },
    [filterTab, router, searchQuery, showToast]
  );

  // Load Settings
  const fetchSettings = useCallback(async () => {
    try {
      const s = await getSuperadminSettings();
      setStandartPrice(String(s.standart_price ?? 150000));
      setFreeDurationDays(String(s.free_duration_days ?? 60));
      setFreeMaxContracts(String(s.free_max_contracts ?? 3));
      setPaynetUrl(s.paynet_url || "");
      setCardNumber(s.card_number || "");
      setCardHolder(s.card_holder || "");
      setSupportTelegram(s.support_telegram || "");
      setQrPreviewUrl(s.paynet_qr_image || null);
      setQrFile(null);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Sozlamalarni yuklab bo'lmadi.");
    }
  }, [showToast]);

  // Load Subscription Requests
  const fetchRequests = useCallback(
    async (statusVal: RequestFilter = requestFilter) => {
      try {
        setLoadingRequests(true);
        const list = await getSuperadminRequests(statusVal);
        setRequests(list);
      } catch (err: unknown) {
        showToast("error", err instanceof Error ? err.message : "So'rovlarni yuklab bo'lmadi.");
      } finally {
        setLoadingRequests(false);
      }
    },
    [requestFilter, showToast]
  );

  // Guard & Initial Mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready?.();
      window.Telegram.WebApp.expand?.();
    }

    getBootstrap({ forceRefresh: true })
      .then((boot) => {
        const me = boot?.me;
        if (!me) {
          router.replace("/login");
          return;
        }
        const isSuper = Boolean(me.is_superuser || me.is_superadmin || me.role === "superadmin");
        if (!isSuper) {
          if (me.role === "ijarachi" || me.role === "user") {
            router.replace("/client");
          } else {
            router.replace("/");
          }
          return;
        }
        setCurrentUser(me);
        setAuthChecking(false);
        fetchArendators("", "all");
        fetchSettings();
        fetchRequests("pending");
      })
      .catch(() => {
        router.replace("/");
      });
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch Arendators on search/filter changes (debounced lightly for search)
  useEffect(() => {
    if (authChecking) return;
    const t = setTimeout(() => {
      fetchArendators(searchQuery, filterTab);
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery, filterTab, authChecking, fetchArendators]);

  // Re-fetch Requests when request filter changes
  useEffect(() => {
    if (authChecking) return;
    fetchRequests(requestFilter);
  }, [requestFilter, authChecking, fetchRequests]);

  // Actions: Toggle Freeze
  const handleToggleFreeze = async (item: SuperadminArendatorItem) => {
    try {
      setActionBusyId(item.id);
      const res = await toggleArendatorFreeze(item.id);
      showToast("success", res.detail);
      await fetchArendators(searchQuery, filterTab);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Amalni bajarishda xatolik.");
    } finally {
      setActionBusyId(null);
    }
  };

  // Actions: Grant Standart (+30 days)
  const handleGrantStandart = async (item: SuperadminArendatorItem) => {
    try {
      setActionBusyId(item.id);
      const res = await grantArendatorSubscription(item.id, 30);
      showToast("success", res.detail);
      await fetchArendators(searchQuery, filterTab);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Obunani faollashtirishda xatolik.");
    } finally {
      setActionBusyId(null);
    }
  };

  // Actions: Save Global Subscription Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const fd = new FormData();
      fd.append("standart_price", String(Math.max(0, parseInt(standartPrice || "0", 10) || 0)));
      fd.append("free_duration_days", String(Math.max(1, parseInt(freeDurationDays || "60", 10) || 60)));
      fd.append("free_max_contracts", String(Math.max(1, parseInt(freeMaxContracts || "3", 10) || 3)));
      fd.append("paynet_url", paynetUrl.trim());
      fd.append("card_number", cardNumber.trim());
      fd.append("card_holder", cardHolder.trim());
      fd.append("support_telegram", supportTelegram.trim());
      if (qrFile) {
        fd.append("paynet_qr_image", qrFile);
      }

      const updated = await updateSuperadminSettings(fd);
      setQrPreviewUrl(updated.paynet_qr_image || null);
      setQrFile(null);
      showToast("success", "💾 Sozlamalar muvaffaqiyatli saqlandi! /subscription sahifasida yangilandi.");
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Sozlamalarni saqlashda xatolik.");
    } finally {
      setSavingSettings(false);
    }
  };

  // Actions: Approve / Reject Pending Subscription Request
  const handleApproveRequest = async (req: SubscriptionRequest) => {
    try {
      setRequestBusyId(req.id);
      const res = await approveSuperadminRequest(req.id);
      showToast("success", res.detail);
      await Promise.all([fetchRequests(requestFilter), fetchArendators(searchQuery, filterTab)]);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Tasdiqlashda xatolik.");
    } finally {
      setRequestBusyId(null);
    }
  };

  const handleRejectRequest = async (req: SubscriptionRequest) => {
    try {
      setRequestBusyId(req.id);
      const res = await rejectSuperadminRequest(req.id);
      showToast("success", res.detail);
      await Promise.all([fetchRequests(requestFilter), fetchArendators(searchQuery, filterTab)]);
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "Rad etishda xatolik.");
    } finally {
      setRequestBusyId(null);
    }
  };

  const formatUZS = (amount: number | string) => {
    const num = Number(amount) || 0;
    return `${num.toLocaleString("ru-RU")} UZS`;
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 max-w-md mx-auto">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
          <p className="text-xs font-medium text-slate-500">Superadmin huquqlari tekshirilmoqda...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="w-full max-w-md mx-auto min-h-screen bg-slate-50 text-slate-900 pb-16 px-4 pt-4 relative">
      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-3 duration-200 ${
            toast.type === "success"
              ? "bg-emerald-900 text-white border-emerald-700"
              : "bg-rose-900 text-white border-rose-700"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="leading-snug">{toast.message}</span>
        </div>
      )}

      {/* Top Navigation Header */}
      <div className="flex items-center justify-between gap-2 pb-3">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold shadow-2xs transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Ilovaga qaytish</span>
        </button>

        <button
          type="button"
          onClick={() => {
            fetchArendators(searchQuery, filterTab);
            fetchRequests(requestFilter);
            fetchSettings();
          }}
          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 shadow-2xs transition cursor-pointer"
          title="Yangilash"
        >
          <RefreshCw className={`w-4 h-4 ${loadingArendators || loadingRequests ? "animate-spin text-blue-600" : ""}`} />
        </button>
      </div>

      {/* Superadmin Hero Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-4 rounded-3xl shadow-md mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-1">
            <Crown className="w-3 h-3" />
            <span>Superadmin Dashboard</span>
          </div>
          <h1 className="text-lg font-extrabold tracking-tight truncate">
            {currentUser?.full_name || "Platforma Egasi"}
          </h1>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Arendatorlar, obunalar va Paynet sozlamalari
          </p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 flex items-center justify-center shadow-md shrink-0">
          <Shield className="w-6 h-6" />
        </div>
      </div>

      {/* 3 Primary Tabs */}
      <div className="grid grid-cols-3 gap-1.5 bg-slate-200/70 p-1 rounded-2xl mb-4">
        <button
          type="button"
          onClick={() => setActiveTab("arendators")}
          className={`py-2 px-2 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "arendators"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Arendatorlar</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`py-2 px-2 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === "settings"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Tarif & Paynet</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`py-2 px-2 rounded-xl text-[11px] font-bold transition cursor-pointer flex items-center justify-center gap-1 relative ${
            activeTab === "requests"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>So&apos;rovlar</span>
          {kpi.pending_requests > 0 && (
            <span className="ml-0.5 px-1.5 py-0.2 bg-rose-600 text-white text-[9px] font-extrabold rounded-full">
              {kpi.pending_requests}
            </span>
          )}
        </button>
      </div>

      {/* ================================================================= */}
      {/* TAB 1: ARENDATORLAR NAZORATI                                      */}
      {/* ================================================================= */}
      {activeTab === "arendators" && (
        <div className="space-y-4">
          {/* Top KPI Summary Cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-slate-400">Jami Arendatorlar</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{kpi.total}</p>
            </div>
            <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-100 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-blue-600">Standart (To&apos;layotgan)</p>
              <p className="text-xl font-black text-blue-900 mt-0.5">{kpi.standard}</p>
            </div>
            <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-100 shadow-2xs">
              <p className="text-[10px] font-bold uppercase text-emerald-600">Free (Sinovdagilar)</p>
              <p className="text-xl font-black text-emerald-900 mt-0.5">{kpi.free}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-100 shadow-2xs">
                <p className="text-[9px] font-bold uppercase text-amber-700 leading-tight">Muddati o&apos;tgan</p>
                <p className="text-lg font-black text-amber-900 mt-0.5">{kpi.expired}</p>
              </div>
              <div className="bg-rose-50/70 p-3 rounded-2xl border border-rose-100 shadow-2xs">
                <p className="text-[9px] font-bold uppercase text-rose-700 leading-tight">Muzlatilgan</p>
                <p className="text-lg font-black text-rose-900 mt-0.5">{kpi.frozen}</p>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ism, telefon, @username yoki kod bo'yicha qidirish..."
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-2xl shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {(
              [
                { id: "all", label: "Barchasi" },
                { id: "standard", label: "To'layotganlar (Standart)" },
                { id: "free", label: "Free (Sinov)" },
                { id: "expired", label: "To'lamaganlar" },
                { id: "frozen", label: "Muzlatilganlar" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                  filterTab === tab.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Arendator List */}
          {loadingArendators ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-36 bg-white rounded-3xl border border-slate-100 p-4 animate-pulse" />
              ))}
            </div>
          ) : arendators.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">
                Ushbu bo&apos;limda arendatorlar topilmadi.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {arendators.map((item) => {
                const isBusy = actionBusyId === item.id;
                const telNumber = cleanPhoneNumber(item.phone);
                const isOverdue = item.days_delta < 0;

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-3xl border p-4 shadow-xs space-y-3 ${
                      item.is_frozen
                        ? "border-rose-200 bg-rose-50/20"
                        : item.status_category === "expired"
                        ? "border-amber-200"
                        : "border-slate-100"
                    }`}
                  >
                    {/* Top Row: Identity + Plan Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-bold text-sm text-slate-900 truncate">
                            {item.full_name || item.username || `ID #${item.id}`}
                          </h3>
                          {item.is_superuser && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded-md">
                              ADMIN
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] flex-wrap">
                          {item.username && (
                            <a
                              href={`https://t.me/${item.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-600 font-semibold hover:underline"
                            >
                              @{item.username}
                            </a>
                          )}
                          {item.tenant_code && (
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              {item.tenant_code}
                            </span>
                          )}
                        </div>

                        {telNumber ? (
                          <button
                            type="button"
                            onClick={() => initiatePhoneCall(item.phone)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 pt-0.5 cursor-pointer"
                          >
                            <Phone className="w-3 h-3" />
                            <span>{item.phone}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 block">Telefon kiritilmagan</span>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                            item.is_frozen
                              ? "bg-rose-100 text-rose-700 border border-rose-200"
                              : item.plan === "standard"
                              ? "bg-blue-100 text-blue-700 border border-blue-200"
                              : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {item.is_frozen ? "❄️ Muzlatilgan" : item.plan_label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          <Car className="w-3 h-3 text-slate-500" />
                          {item.plan === "standard"
                            ? `${item.active_contracts_count} ta shartnoma`
                            : `${item.active_contracts_count} / 3 ta shartnoma`}
                        </span>
                      </div>
                    </div>

                    {/* Dates & Days Remaining */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Ro&apos;yxatdan o&apos;tgan:</span>
                        <span className="font-semibold text-slate-700">{formatDate(item.date_joined)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Tugash sanasi:</span>
                        <span className="font-semibold text-slate-800">
                          {item.expires_date ? formatDate(item.expires_date) : "—"}
                        </span>
                        {item.expires_date && (
                          <span
                            className={`block text-[10px] font-bold ${
                              isOverdue || !item.is_subscription_active
                                ? "text-rose-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {isOverdue
                              ? `${Math.abs(item.days_delta)} kun o'tib ketdi`
                              : `${item.days_delta} kun qoldi`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleFreeze(item)}
                        className={`py-2 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                          item.is_frozen
                            ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {item.is_frozen ? (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Muzlatishdan chiqarish</span>
                          </>
                        ) : (
                          <>
                            <Snowflake className="w-3.5 h-3.5" />
                            <span>Muzlatish</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleGrantStandart(item)}
                        className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Standart (+30 kun)</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: TARIF VA TO'LOV SOZLAMALARI                                */}
      {/* ================================================================= */}
      {activeTab === "settings" && (
        <form onSubmit={handleSaveSettings} className="space-y-4">
          {/* Pricing Settings Card */}
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-blue-600" />
              <span>Tarif Sozlamalari</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Standart tarif oylik narxi (UZS)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={standartPrice}
                onChange={(e) => setStandartPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Free muddati (kun)
                </label>
                <input
                  type="number"
                  min={1}
                  value={freeDurationDays}
                  onChange={(e) => setFreeDurationDays(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Free maks. mashina
                </label>
                <input
                  type="number"
                  min={1}
                  value={freeMaxContracts}
                  onChange={(e) => setFreeMaxContracts(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Paynet & Card Details Card */}
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs space-y-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <QrCode className="w-4 h-4 text-emerald-600" />
              <span>Paynet va Karta Rekvizitlari</span>
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Paynet to&apos;lov havolasi (URL)
              </label>
              <input
                type="url"
                value={paynetUrl}
                onChange={(e) => setPaynetUrl(e.target.value)}
                placeholder="https://paynet.uz/..."
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Paynet QR Image Upload */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Paynet QR-kod rasmi
              </label>
              {qrPreviewUrl && (
                <div className="p-2 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrPreviewUrl}
                    alt="Paynet QR Preview"
                    className="max-h-44 object-contain rounded-xl"
                  />
                </div>
              )}
              <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-dashed border-slate-300 cursor-pointer transition">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>{qrFile ? qrFile.name : "Yangi QR rasm yuklash"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setQrFile(file);
                      setQrPreviewUrl(URL.createObjectURL(file));
                    }
                  }}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Zaxira karta raqami
              </label>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="8600 0000 0000 0000"
                className="w-full px-3.5 py-2.5 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Karta egasining F.I.Sh
              </label>
              <input
                type="text"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                placeholder="GAYRATJON XUSHBOQOV"
                className="w-full px-3.5 py-2.5 text-xs font-semibold uppercase bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Qo&apos;llab-quvvatlash Telegram (@username)
              </label>
              <input
                type="text"
                value={supportTelegram}
                onChange={(e) => setSupportTelegram(e.target.value)}
                placeholder="@carenda_support"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingSettings}
            className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-md transition active:scale-[0.99] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {savingSettings ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>💾 Saqlash</span>
          </button>
        </form>
      )}

      {/* ================================================================= */}
      {/* TAB 3: KELGAN TO'LOV SO'ROVLARI                                   */}
      {/* ================================================================= */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          {/* Request Status Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {(
              [
                { id: "pending", label: "Kutilmoqda" },
                { id: "approved", label: "Tasdiqlangan" },
                { id: "rejected", label: "Rad etilgan" },
                { id: "all", label: "Barchasi" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setRequestFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                  requestFilter === f.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loadingRequests ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 bg-white rounded-3xl border border-slate-100 p-4 animate-pulse" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center space-y-2">
              <Clock className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">
                Tanlangan bo&apos;limda to&apos;lov so&apos;rovlari mavjud emas.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const isBusy = requestBusyId === req.id;
                const telNum = cleanPhoneNumber(req.user_phone);

                return (
                  <div
                    key={req.id}
                    className="bg-white rounded-3xl border border-slate-100 p-4 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-slate-900 truncate">
                          {req.user_name || req.user_username || `Foydalanuvchi #${req.user_id}`}
                        </h3>
                        <div className="flex items-center gap-2 text-[11px] mt-0.5 flex-wrap">
                          {req.user_tenant_code && (
                            <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                              {req.user_tenant_code}
                            </span>
                          )}
                          {telNum && (
                            <button
                              type="button"
                              onClick={() => initiatePhoneCall(req.user_phone)}
                              className="inline-flex items-center gap-1 text-blue-600 font-semibold cursor-pointer"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{req.user_phone}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full shrink-0 ${
                          req.status === "pending"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : req.status === "approved"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : "bg-rose-100 text-rose-800 border border-rose-200"
                        }`}
                      >
                        {req.status_display}
                      </span>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-3 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Tarif:</span>
                        <span className="font-bold text-slate-900">{req.plan_display}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Summa:</span>
                        <span className="font-extrabold text-blue-700">{formatUZS(req.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Yuborilgan:</span>
                        <span className="text-slate-700 font-medium">{formatDateTime(req.created_at)}</span>
                      </div>
                      {req.note && (
                        <div className="pt-1 border-t border-slate-200/70">
                          <span className="text-slate-400 text-[10px] block">Mijoz izohi:</span>
                          <p className="text-slate-700 font-medium">{req.note}</p>
                        </div>
                      )}
                      {req.admin_note && (
                        <div className="pt-1 border-t border-slate-200/70">
                          <p className="text-slate-500 text-[11px]">{req.admin_note}</p>
                        </div>
                      )}
                    </div>

                    {req.status === "pending" && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleApproveRequest(req)}
                          className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Tasdiqlash</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleRejectRequest(req)}
                          className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Rad etish</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
