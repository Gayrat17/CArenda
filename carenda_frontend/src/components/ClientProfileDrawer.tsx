"use client";

import React, { useState, useMemo } from "react";
import {
  User,
  Car,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Smartphone,
  LogOut,
  ChevronDown,
  X,
  Copy,
  Check,
  Phone,
  Shield,
  CreditCard,
  AlertCircle,
  Loader2,
  Calendar,
  DollarSign,
  Sparkles,
  Info,
} from "lucide-react";
import { ClientContract, ClientDashboardResponse } from "@/types/fleet";
import { formatUSD, formatDate, initiatePhoneCall } from "@/lib/utils";

interface ClientProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientDashboardResponse["client"];
  contracts: ClientContract[];
  activeContract: ClientContract | null;
  onSelectContract: (contractId: number) => void;
  onDownloadExcel: () => Promise<void>;
  downloadingExcel: boolean;
  onLogout: () => void;
}

type ModalType =
  | "info"
  | "myCars"
  | "prepayment"
  | "fullPayoff"
  | "historyExcel"
  | "deviceInfo"
  | "logoutConfirm"
  | null;

export default function ClientProfileDrawer({
  isOpen,
  onClose,
  client,
  contracts,
  activeContract,
  onSelectContract,
  onDownloadExcel,
  downloadingExcel,
  onLogout,
}: ClientProfileDrawerProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);
  const [prepayMonths, setPrepayMonths] = useState(1);

  // Renter code determination
  const renterCode = useMemo(() => {
    return (
      activeContract?.invite_code ||
      client.renter_code ||
      client.invite_code ||
      "CR4829"
    );
  }, [activeContract?.invite_code, client.renter_code, client.invite_code]);

  // Copy code helper
  const handleCopyCode = () => {
    if (!renterCode) return;
    try {
      navigator.clipboard.writeText(renterCode);
      setCopiedCode(true);
      if (typeof window !== "undefined") {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
      }
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // fallback
    }
  };

  // Copy card helper
  const handleCopyCard = (cardNum: string) => {
    try {
      navigator.clipboard.writeText(cardNum.replace(/\s+/g, ""));
      setCopiedCard(true);
      if (typeof window !== "undefined") {
        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
      }
      setTimeout(() => setCopiedCard(false), 2000);
    } catch {
      // fallback
    }
  };

  // Device Info detection
  const deviceInfo = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        device: "Noma'lum qurilma",
        os: "Noma'lum OS",
        clientType: "Brauzer",
        platform: "Web",
        currentTime: new Date().toLocaleString("uz-UZ"),
      };
    }

    const ua = navigator.userAgent || "";
    let os = "Boshqa operatsion tizim";
    let device = "Kompyuter / Desktop";

    if (/iPhone/i.test(ua)) {
      device = "Apple iPhone";
      os = "iOS";
    } else if (/iPad/i.test(ua)) {
      device = "Apple iPad";
      os = "iPadOS";
    } else if (/Android/i.test(ua)) {
      device = "Android Qurilma";
      os = "Android OS";
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      device = "Apple Mac";
      os = "macOS";
    } else if (/Windows/i.test(ua)) {
      device = "Windows Kompyuter";
      os = "Windows OS";
    } else if (/Linux/i.test(ua)) {
      device = "Linux Qurilma";
      os = "Linux OS";
    }

    const tgPlatform = window.Telegram?.WebApp?.platform;
    const isTelegram = Boolean(
      tgPlatform || /Telegram/i.test(ua) || window.Telegram?.WebApp?.initData
    );

    const clientType = isTelegram
      ? `Telegram WebApp (${tgPlatform || "Client"})`
      : /Chrome/i.test(ua)
      ? "Google Chrome"
      : /Safari/i.test(ua)
      ? "Apple Safari"
      : /Firefox/i.test(ua)
      ? "Mozilla Firefox"
      : "Veb Brauzer";

    const now = new Date();
    const timeStr = now.toLocaleTimeString("uz-UZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateStr = now.toLocaleDateString("uz-UZ", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    return {
      device,
      os,
      clientType,
      platform: String(tgPlatform || "Mobil / Web"),
      currentTime: `${dateStr}, ${timeStr}`,
      userAgent: ua,
    };
  }, []);

  // Prepayment calculations
  const monthlyAmount = useMemo(() => {
    if (!activeContract) return 0;
    return parseFloat(activeContract.monthly_amount || "0") || 0;
  }, [activeContract]);

  const prepayTotal = useMemo(() => {
    return monthlyAmount * prepayMonths;
  }, [monthlyAmount, prepayMonths]);

  // Full payoff calculations
  const payoffMetrics = useMemo(() => {
    if (!activeContract) {
      return {
        totalAmount: 0,
        paidTotal: 0,
        remainingTotal: 0,
        paidMonths: 0,
        remainingMonths: 0,
        totalMonths: 0,
      };
    }
    const totalAmount = parseFloat(activeContract.total_amount || "0") || 0;
    const paidTotal = parseFloat(activeContract.paid_total_usd || "0") || 0;
    const remainingTotal = parseFloat(activeContract.remaining_total_usd || "0") || 0;
    const paidMonths = activeContract.payments.filter((p) => p.status === "paid").length;
    const totalMonths = activeContract.months_count || 0;
    const remainingMonths = Math.max(0, totalMonths - paidMonths);

    return {
      totalAmount,
      paidTotal,
      remainingTotal,
      paidMonths,
      remainingMonths,
      totalMonths,
    };
  }, [activeContract]);

  // Payment history for active contract
  const paymentHistory = useMemo(() => {
    if (!activeContract) return [];
    return activeContract.payments.filter(
      (p) => parseFloat(p.paid_amount || "0") > 0 || p.status === "paid"
    );
  }, [activeContract]);

  const openModal = (type: ModalType) => {
    onClose();
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  return (
    <>
      {/* 1. MAIN BOTTOM SHEET / DRAWER */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onClose}
          />

          {/* Drawer Sheet */}
          <div className="relative bg-white w-full max-w-md mx-auto rounded-t-3xl shadow-2xl z-10 overflow-hidden animate-in slide-in-from-bottom duration-200 flex flex-col max-h-[85vh]">
            {/* Grab Handle */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
            </div>

            {/* Profile Header in Drawer */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-900 text-base truncate capitalize">
                    {client.full_name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {client.phone && (
                      <span className="text-xs font-mono font-medium text-slate-500">
                        {client.phone}
                      </span>
                    )}
                    <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                      {renterCode}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Menu List */}
            <div className="p-3 space-y-1 overflow-y-auto">
              {/* 1. Mening ma'lumotlarim */}
              <button
                type="button"
                onClick={() => openModal("info")}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      Mening ma&apos;lumotlarim
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Ism, telefon, maxsus kod va arendator
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
              </button>

              {/* 2. Mening mashinalarim */}
              <button
                type="button"
                onClick={() => openModal("myCars")}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Car className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">
                        Mening mashinalarim
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700">
                        {contracts.length}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block">
                      {activeContract
                        ? `${activeContract.car_name} (${activeContract.plate_number})`
                        : "Mashinalar va shartnomalar"}
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
              </button>

              {/* 3. Oldindan to'lov */}
              <button
                type="button"
                onClick={() => openModal("prepayment")}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <CalendarClock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      Oldindan to&apos;lov (Prepayment)
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Navbatdagi oylar uchun to&apos;lov va rekvizitlar
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
              </button>

              {/* 4. Shartnomani to'liq yopish */}
              <button
                type="button"
                onClick={() => openModal("fullPayoff")}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      Shartnomani to&apos;liq yopish
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Muddatidan oldin butunlay yopish va qarz qoldig&apos;i
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
              </button>

              {/* 5. To'lovlar tarixi va Excel */}
              <button
                type="button"
                onClick={() => openModal("historyExcel")}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      To&apos;lovlar tarixi va Excel
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      To&apos;lovlar ro&apos;yxati va .xlsx yuklab olish
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
              </button>

              {/* 6. Faol qurilma */}
              <button
                type="button"
                onClick={() => openModal("deviceInfo")}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-800 block">
                      Faol qurilma (Device Info)
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      {deviceInfo.device} • Xavfsizlik
                    </span>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
              </button>

              {/* 7. Hisobdan chiqish (Log Out) */}
              <div className="pt-2 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={() => openModal("logoutConfirm")}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition cursor-pointer text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <LogOut className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-bold block">
                        Hisobdan chiqish
                      </span>
                      <span className="text-[11px] text-rose-400 block">
                        Sessiyani yakunlash va login sahifasiga qaytish
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-rose-400 -rotate-90" />
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-50 text-center text-[11px] text-slate-400 font-medium border-t border-slate-100">
              Carenda v2.0 • Mijoz Profil Menyusi
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL 1: MENING MA'LUMOTLARIM (INFO) */}
      {activeModal === "info" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={closeModal}
          />
          <div className="relative bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Mening ma&apos;lumotlarim
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Shaxsiy hisob identifikatsiyasi
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Ism-familiya */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">
                  Ism va Familiya
                </span>
                <p className="font-extrabold text-slate-900 text-sm capitalize">
                  {client.full_name}
                </p>
              </div>

              {/* Telefon raqam */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1">
                <span className="text-[11px] text-slate-400 block font-medium">
                  Telefon raqami
                </span>
                <p className="font-mono font-bold text-slate-900 text-sm">
                  {client.phone || "Kiritilmagan"}
                </p>
              </div>

              {/* Renter kodi */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-blue-700 block">
                      Mijoz / Renter kodi
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Arendator biriktirgan maxsus shartnoma kodingiz
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Nusxalandi!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Nusxalash</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-blue-200/80 font-mono font-black text-blue-900 text-center text-lg tracking-wider">
                  {renterCode}
                </div>
              </div>

              {/* Arendator ma'lumotlari */}
              {activeContract && (
                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-800">
                      Arendator (Mashina egasi)
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-slate-700">
                      <span className="text-slate-400">Ism:</span>{" "}
                      <b>{activeContract.owner_name}</b>
                    </p>
                    <p className="text-slate-700 font-mono">
                      <span className="text-slate-400 font-sans">Telefon:</span>{" "}
                      <b>{activeContract.owner_phone || "Mavjud emas"}</b>
                    </p>
                  </div>
                  {activeContract.owner_phone && (
                    <button
                      type="button"
                      onClick={() => initiatePhoneCall(activeContract.owner_phone)}
                      className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Phone className="w-4 h-4" />
                      <span>Arendatorga qo&apos;ng&apos;iroq qilish</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODAL 2: MENING MASHINALARIM (MY CARS) */}
      {activeModal === "myCars" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={closeModal}
          />
          <div className="relative bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Mening mashinalarim ({contracts.length})
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Sizga biriktirilgan avtomobillar
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {contracts.map((c) => {
                const isSelected = c.id === activeContract?.id;
                return (
                  <div
                    key={c.id}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20"
                        : "bg-slate-50/70 border-slate-200/80 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900 truncate">
                            {c.car_name}
                          </h4>
                          {c.car_year && (
                            <span className="text-xs text-slate-400">
                              ({c.car_year})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 block">
                          Arendator: {c.owner_name}
                        </span>
                      </div>

                      {/* License plate */}
                      <div className="flex items-center border border-slate-800 rounded-md overflow-hidden bg-white font-mono font-bold text-[11px] shrink-0">
                        <div className="bg-slate-100 px-1 text-slate-700 border-r border-slate-300">
                          UZ
                        </div>
                        <div className="px-1.5 py-0.5 text-slate-900">
                          {c.plate_number}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div className="p-2 bg-white rounded-xl border border-slate-100">
                        <span className="text-[10px] text-slate-400 block">
                          Oylik to&apos;lov
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatUSD(c.monthly_amount)}
                        </span>
                      </div>
                      <div className="p-2 bg-white rounded-xl border border-slate-100">
                        <span className="text-[10px] text-slate-400 block">
                          Qoldiq qarz
                        </span>
                        <span className="font-mono font-bold text-blue-700">
                          {formatUSD(c.remaining_total_usd)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1">
                      {isSelected ? (
                        <div className="flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-2xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Hozir faol tanlangan</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectContract(c.id);
                            closeModal();
                          }}
                          className="w-full py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs rounded-xl transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Car className="w-3.5 h-3.5 text-blue-600" />
                          <span>Ushbu mashinani tanlash</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL 3: OLDINDAN TO'LOV (PREPAYMENT) */}
      {activeModal === "prepayment" && activeContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={closeModal}
          />
          <div className="relative bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CalendarClock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Oldindan to&apos;lov
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Bir necha oy uchun to&apos;lov
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Active Car info */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">
                    Avtomobil
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {activeContract.car_name}
                  </span>
                </div>
                <div className="font-mono text-xs font-bold text-slate-800 bg-white px-2 py-1 rounded-lg border border-slate-200">
                  {activeContract.plate_number}
                </div>
              </div>

              {/* Month selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">
                    Necha oylik to&apos;lov qilmoqchisiz?
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    1 oy = {formatUSD(monthlyAmount)}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 6].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPrepayMonths(m)}
                      className={`py-2 px-1 text-xs font-bold rounded-xl border transition cursor-pointer active:scale-95 ${
                        prepayMonths === m
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {m} oy
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculated Amount Banner */}
              <div className="p-4 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl shadow-sm space-y-1">
                <span className="text-xs text-emerald-100 block font-medium">
                  {prepayMonths} oylik jami to&apos;lov summasi:
                </span>
                <div className="text-3xl font-black font-mono tracking-tight">
                  {formatUSD(prepayTotal)}
                </div>
                <span className="text-[11px] text-emerald-200 block pt-1">
                  Keyingi {prepayMonths} oylik grafik yopiladi
                </span>
              </div>

              {/* Payment details & Bank card */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    To&apos;lov rekvizitlari
                  </span>
                </div>

                <div className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 block font-medium">
                      Arendator telefon raqami (Paynet / Karta)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyCard(activeContract.owner_phone || "")}
                      className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      {copiedCard ? "Nusxalandi!" : "Nusxalash"}
                    </button>
                  </div>
                  <div className="font-mono font-bold text-slate-900 text-sm">
                    {activeContract.owner_phone || "Arendator bilan bog'laning"}
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs leading-relaxed space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Chek yuborish bo&apos;yicha:</span>
                  </div>
                  <p className="text-[11px]">
                    To&apos;lovni amalga oshirgach, chek skrinshotini arendatoringizga
                    Telegram orqali yuboring. Arendator tasdiqlagach, to&apos;lov
                    tizimda avtomatik aks etadi.
                  </p>
                </div>

                {activeContract.owner_phone && (
                  <button
                    type="button"
                    onClick={() => initiatePhoneCall(activeContract.owner_phone)}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Arendator bilan bog&apos;lanish</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL 4: SHARTNOMANI TO'LIQ YOPISH (FULL PAYOFF) */}
      {activeModal === "fullPayoff" && activeContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={closeModal}
          />
          <div className="relative bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Shartnomani to&apos;liq yopish
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Muddatidan oldin butunlay sotib olish
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Big Hero Balance */}
              <div className="p-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl shadow-sm text-center space-y-1">
                <span className="text-xs text-amber-100 block font-medium">
                  To&apos;liq yopish uchun jami qarz qoldig&apos;i:
                </span>
                <div className="text-3xl font-black font-mono tracking-tight">
                  {formatUSD(payoffMetrics.remainingTotal)}
                </div>
                <span className="text-[11px] text-amber-200 block pt-1">
                  Qolgan {payoffMetrics.remainingMonths} oylik shartnoma muddatidan oldin yopiladi
                </span>
              </div>

              {/* Financial Breakdown */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                <h4 className="text-xs font-bold text-slate-800">
                  Hisob-kitob tafsilotlari
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Avtomobil:</span>
                    <span className="font-bold text-slate-900">
                      {activeContract.car_name} ({activeContract.plate_number})
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Shartnoma umumiy summasi:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatUSD(payoffMetrics.totalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Shu paytgacha to&apos;landi:</span>
                    <span className="font-mono font-bold text-emerald-600">
                      {formatUSD(payoffMetrics.paidTotal)} ({payoffMetrics.paidMonths} oy)
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-700 font-bold">To&apos;liq yopish summasi:</span>
                    <span className="font-mono font-black text-amber-700 text-sm">
                      {formatUSD(payoffMetrics.remainingTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Legal / Transfer Note */}
              <div className="p-3.5 bg-blue-50 border border-blue-200/80 rounded-2xl text-blue-900 text-xs leading-relaxed space-y-1">
                <span className="font-bold block">
                  📄 Notarial rasmiylashtirish:
                </span>
                <p className="text-[11px] text-slate-600">
                  Qarz summasini to&apos;liq yopganingizdan so&apos;ng, avtomobil
                  notarial tartibda to&apos;liq sizning nomingizga rasmiylashtirib
                  beriladi. Arendator bilan bog&apos;lanib yakuniy hisob-kitobni
                  amalga oshiring.
                </p>
              </div>

              {activeContract.owner_phone && (
                <button
                  type="button"
                  onClick={() => initiatePhoneCall(activeContract.owner_phone)}
                  className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  <span>Arendator bilan bog&apos;lanish ({activeContract.owner_name})</span>
                </button>
              )}
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL 5: TO'LOVLAR TARIXI VA EXCEL */}
      {activeModal === "historyExcel" && activeContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={closeModal}
          />
          <div className="relative bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    To&apos;lovlar tarixi va Excel
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {paymentHistory.length} ta to&apos;lov amalga oshirilgan
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Excel Download CTA */}
              <button
                type="button"
                onClick={onDownloadExcel}
                disabled={downloadingExcel}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl shadow-sm transition active:scale-98 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {downloadingExcel ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Excel yuklanmoqda...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Excel (.xlsx) hisobotini yuklab olish</span>
                  </>
                )}
              </button>

              {/* History list */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-bold text-slate-700 block">
                  To&apos;lovlar ro&apos;yxati
                </span>

                {paymentHistory.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                    Hozircha qabul qilingan to&apos;lovlar mavjud emas
                  </div>
                ) : (
                  paymentHistory.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                          {p.month_number}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block truncate">
                            {p.month_number}-oy to&apos;lovi
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {p.paid_at ? formatDate(p.paid_at) : formatDate(p.due_date)}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-emerald-600 block">
                          +{formatUSD(p.paid_amount)}
                        </span>
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">
                          To&apos;langan
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL 6: FAOL QURILMA (DEVICE INFO) */}
      {activeModal === "deviceInfo" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={closeModal}
          />
          <div className="relative bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Faol qurilma va xavfsizlik
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Sessiya xavfsizligi ma&apos;lumotlari
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Device badge card */}
              <div className="p-4 bg-purple-50/70 border border-purple-100 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-purple-700">
                    Hozirgi faol qurilma
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Faol</span>
                  </span>
                </div>

                <div className="text-base font-black text-slate-900">
                  {deviceInfo.device}
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    <b>Operatsion tizim:</b> {deviceInfo.os}
                  </p>
                  <p>
                    <b>Ilova turi:</b> {deviceInfo.clientType}
                  </p>
                  <p>
                    <b>Platforma:</b> {deviceInfo.platform}
                  </p>
                  <p>
                    <b>Kirish vaqti:</b> {deviceInfo.currentTime}
                  </p>
                </div>
              </div>

              {/* Security info */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>Xavfsiz ulanish (HTTPS / SSL)</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Hisobingiz ma&apos;lumotlari shifrlangan kanal orqali uzatiladi.
                  Agar ushbu qurilma sizga tegishli bo&apos;lmasa, hisobingiz
                  xavfsizligi uchun quyidagi tugma orqali sessiyadan chiqing.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  closeModal();
                  setActiveModal("logoutConfirm");
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Ushbu qurilmadan chiqish</span>
              </button>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL 7: LOG OUT CONFIRMATION */}
      {activeModal === "logoutConfirm" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={closeModal}
          />
          <div className="relative bg-white w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-2xs">
              <LogOut className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <h3 className="font-extrabold text-base text-slate-900">
                Hisobdan chiqmoqchimisiz?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Hisobdan chiqsangiz, barcha sessiya va avtorizatsiya ma&apos;lumotlari
                tozalanadi. Qayta kirish uchun maxsus kodingiz kerak bo&apos;ladi.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  closeModal();
                  onLogout();
                }}
                className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Ha, hisobdan chiqish</span>
              </button>

              <button
                type="button"
                onClick={closeModal}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition active:scale-95 cursor-pointer"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
