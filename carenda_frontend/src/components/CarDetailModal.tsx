"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Phone,
  Calendar,
  AlertCircle,
  FileText,
  Wrench,
  Clock,
  ArrowLeft,
  User,
  FileSpreadsheet,
  MessageSquare,
  Lock,
  Plus,
  Pencil,
} from "lucide-react";
import { downloadSingleContractExcel, getCarDetail, updateCar, updateDriver } from "@/lib/api";
import { CarDetail, Payment } from "@/types/fleet";
import {
  formatDate,
  formatUSD,
  formatPercent,
  getContractStatusInfo,
  getPaymentStatusInfo,
  cleanPhoneNumber,
  initiatePhoneCall,
  formatUzbekPhone,
} from "@/lib/utils";
import { CloseContractModal } from "./CloseContractModal";

interface CarDetailModalProps {
  carId: number | null;
  refreshTrigger?: number;
  onClose: () => void;
  onRentClick: (car: CarDetail) => void;
  onPaymentClick: (payment: Payment, carName: string, driverName: string) => void;
  onRefreshParent: () => void;
}

export function CarDetailModal({
  carId,
  refreshTrigger,
  onClose,
  onRentClick,
  onPaymentClick,
  onRefreshParent,
}: CarDetailModalProps) {
  const [car, setCar] = useState<CarDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [editingSecondaryPhone, setEditingSecondaryPhone] = useState(false);
  const [secondaryPhoneInput, setSecondaryPhoneInput] = useState("");
  const [savingSecondaryPhone, setSavingSecondaryPhone] = useState(false);

  const handleSaveSecondaryPhone = async () => {
    if (!activeContract?.driver) return;
    try {
      setSavingSecondaryPhone(true);
      const digits = secondaryPhoneInput.replace(/\D/g, "");
      const national = digits.startsWith("998") ? digits.slice(3) : digits;

      let phoneToSave = "";
      if (national.length > 0) {
        if (national.length !== 9) {
          alert("Qo'shimcha telefon raqami to'liq kiritilishi shart (+998 XX XXX XX XX) yoki bo'sh qoldiring.");
          setSavingSecondaryPhone(false);
          return;
        }
        phoneToSave = secondaryPhoneInput.trim();
      }

      await updateDriver(activeContract.driver, { secondary_phone: phoneToSave });
      await fetchDetail();
      setEditingSecondaryPhone(false);
      onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Qo'shimcha raqamni saqlashda xatolik yuz berdi.");
    } finally {
      setSavingSecondaryPhone(false);
    }
  };

  const fetchDetail = async () => {
    if (!carId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getCarDetail(carId, { forceRefresh: true });
      setCar(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Shartnoma ma'lumotlarini yuklashda xatolik.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [carId, refreshTrigger]);

  // Support native Telegram WebApp BackButton
  useEffect(() => {
    const tg = typeof window !== "undefined" ? (window.Telegram?.WebApp as unknown as { BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void } }) : null;
    const backBtn = tg?.BackButton;
    if (backBtn) {
      backBtn.show();
      const handleBack = () => onClose();
      backBtn.onClick(handleBack);
      return () => {
        backBtn.offClick(handleBack);
        backBtn.hide();
      };
    }
  }, [onClose]);

  if (!carId) return null;

  const handleToggleMaintenance = async () => {
    if (!car) return;
    const newStatus = car.status === "available" ? "maintenance" : "available";
    try {
      await updateCar(car.id, { status: newStatus });
      await fetchDetail();
      onRefreshParent();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Holatni o'zgartirishda xatolik yuz berdi.");
    }
  };

  const activeContract = car?.active_contract;

  const handleDownloadContractExcel = async () => {
    if (!activeContract) return;
    try {
      setDownloadingExcel(true);
      const cleanPlate = (car?.plate_number || "").replace(/\s+/g, "");
      const suggestedName = cleanPlate
        ? `shartnoma_${cleanPlate}_${activeContract.id}.xlsx`
        : `shartnoma_${activeContract.id}.xlsx`;
      await downloadSingleContractExcel(activeContract.id, suggestedName);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Excel hisobotini yuklab olishda xatolik yuz berdi.");
    } finally {
      setDownloadingExcel(false);
    }
  };

  // Compute status info based on contract status and payment overdue
  const isOverdue = Boolean(
    activeContract?.payments?.some((p) => {
      if (p.status === "paid") return false;
      const due = new Date(p.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return due < today;
    })
  );

  const statusInfo = car
    ? getContractStatusInfo(
        Boolean(car.status === "rented" && activeContract),
        isOverdue
      )
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden animate-in fade-in duration-150">
      <div className="w-full max-w-md mx-auto h-full flex flex-col bg-slate-50 relative">
        {/* Full-width sticky header with Back button */}
        <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-200/80 bg-white sticky top-0 z-10 shrink-0 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onClose}
              className="p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              title="Orqaga"
              aria-label="Orqaga"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-base leading-tight truncate">
                {car?.name || "Shartnoma ma'lumotlari"}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-800 rounded">
                  {car?.plate_number}
                </span>
                {statusInfo && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                  >
                    {statusInfo.label}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
            title="Yopish"
            aria-label="Yopish"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body with natural full page scrolling */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
          {loading && (
            <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-2">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Shartnoma ma&apos;lumotlari yuklanmoqda...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && car && (
            <>
              {/* Car Year & Notes Card */}
              {(car.year || car.notes) && (
                <div className="p-3.5 bg-white border border-slate-200/80 rounded-2xl text-xs space-y-1.5 shadow-2xs">
                  {car.year && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Ishlab chiqarilgan yili:</span>
                      <span className="font-bold text-slate-800">{car.year}-yil</span>
                    </div>
                  )}
                  {car.notes && (
                    <div className={car.year ? "pt-1.5 border-t border-slate-100" : ""}>
                      <span className="text-slate-500 block text-[11px]">Alohida belgilari / Izoh:</span>
                      <p className="text-slate-800 font-medium mt-0.5 whitespace-pre-wrap">{car.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* STATUS: AVAILABLE or MAINTENANCE */}
              {car.status !== "rented" && (
                <div className="space-y-4">
                  <div className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-2 shadow-2xs">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Standart narxi:</span>
                      <span className="font-semibold text-slate-900 text-sm">
                        {formatUSD(car.default_price)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Qo&apos;shilgan sana:</span>
                      <span className="text-slate-700 font-medium">{formatDate(car.created_at)}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    {car.status === "available" ? (
                      <button
                        onClick={() => {
                          onRentClick(car);
                          onClose();
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-xs transition cursor-pointer"
                      >
                        <FileText className="w-4 h-4" />
                        Ijaraga berish (Shartnoma tuzish)
                      </button>
                    ) : (
                      <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-xl flex items-center gap-2">
                        <Wrench className="w-4 h-4 shrink-0" />
                        <span>Avtomobil hozirda ta&apos;mirda. Yangi shartnoma tuzish uchun uni bo&apos;sh holatga o&apos;tkazing.</span>
                      </div>
                    )}

                    <button
                      onClick={handleToggleMaintenance}
                      className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      {car.status === "available" ? "Ta'mirga o'tkazish" : "Bo'sh deb belgilash"}
                    </button>
                  </div>
                </div>
              )}

              {/* STATUS: RENTED (Active Contract & Full Schedule) */}
              {car.status === "rented" && activeContract && (
                <div className="space-y-4">
                  {/* Driver Card with Multiple Phones */}
                  <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">
                          Mijoz / Haydovchi
                        </p>
                        <h4 className="font-bold text-slate-900 text-base mt-0.5 capitalize">
                          {activeContract.driver_name}
                        </h4>
                      </div>
                      <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5" />
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {/* Primary Phone */}
                      <a
                        href={`tel:${cleanPhoneNumber(activeContract.driver_phone)}`}
                        className="flex items-center justify-between bg-white px-3 py-2.5 rounded-xl border border-blue-100/80 shadow-2xs hover:border-blue-300 transition cursor-pointer active:scale-98"
                      >
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Asosiy raqam</span>
                          <span className="text-xs text-slate-800 font-mono font-bold">
                            {activeContract.driver_phone}
                          </span>
                        </div>
                        <div
                          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xs transition active:scale-95 shrink-0"
                          title="Qo'ng'iroq qilish"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </div>
                      </a>

                      {/* Secondary Phone if available */}
                      {activeContract.driver_secondary_phone ? (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`tel:${cleanPhoneNumber(activeContract.driver_secondary_phone)}`}
                            className="flex-1 flex items-center justify-between bg-white px-3 py-2.5 rounded-xl border border-blue-100/80 shadow-2xs hover:border-blue-300 transition cursor-pointer active:scale-98"
                          >
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium">Qo&apos;shimcha raqam</span>
                              <span className="text-xs text-slate-800 font-mono font-bold">
                                {activeContract.driver_secondary_phone}
                              </span>
                            </div>
                            <div
                              className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs transition active:scale-95 shrink-0"
                              title="Qo'shimcha raqamga qo'ng'iroq qilish"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </div>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSecondaryPhone(true);
                              setSecondaryPhoneInput(activeContract.driver_secondary_phone || "+998 ");
                            }}
                            className="p-2.5 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border border-slate-200/90 rounded-xl transition cursor-pointer shadow-2xs active:scale-95 shrink-0"
                            title="Tahrirlash"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : !editingSecondaryPhone ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSecondaryPhone(true);
                            setSecondaryPhoneInput("+998 ");
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 text-blue-600 border border-dashed border-blue-200 rounded-xl text-xs font-semibold transition active:scale-98 cursor-pointer shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Qo&apos;shimcha telefon raqami qo&apos;shish</span>
                        </button>
                      ) : null}

                      {/* Inline Form to Add / Edit Secondary Phone */}
                      {editingSecondaryPhone && (
                        <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-2 shadow-2xs animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <label className="block text-[11px] font-semibold text-slate-700">
                              Qo&apos;shimcha telefon raqami
                            </label>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ixtiyoriy
                            </span>
                          </div>
                          <input
                            type="tel"
                            value={secondaryPhoneInput}
                            onChange={(e) => setSecondaryPhoneInput(formatUzbekPhone(e.target.value, false))}
                            placeholder="+998 90 123 45 67"
                            className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          />
                          <div className="flex items-center justify-between pt-1">
                            {activeContract.driver_secondary_phone ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSecondaryPhoneInput("");
                                }}
                                className="text-[11px] text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                              >
                                Raqamni o&apos;chirish
                              </button>
                            ) : <div />}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingSecondaryPhone(false)}
                                disabled={savingSecondaryPhone}
                                className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                              >
                                Bekor qilish
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveSecondaryPhone}
                                disabled={savingSecondaryPhone}
                                className="px-3.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                              >
                                {savingSecondaryPhone ? "Saqlanmoqda..." : "Saqlash"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contract Financial Breakdown */}
                  <div className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-2.5 text-xs shadow-2xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Shartnoma boshlangan sana:</span>
                      <span className="font-semibold text-slate-900">{formatDate(activeContract.start_date)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Muddati va to&apos;lov kuni:</span>
                      <span className="font-medium text-slate-800">
                        {activeContract.months_count} oy (har oyning {activeContract.payment_day}-sanasida)
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
                      <span className="text-slate-500">Mashina narxi:</span>
                      <span className="font-medium text-slate-800">{formatUSD(activeContract.car_price)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Boshlang&apos;ich to&apos;lov:</span>
                      <span className="font-semibold text-emerald-600">
                        {formatUSD(activeContract.initial_payment)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Qarz summasi (Asosiy):</span>
                      <span className="font-medium text-slate-800">
                        {formatUSD(activeContract.principal_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Yillik ustama foiz:</span>
                      <span className="font-medium text-slate-800">{formatPercent(activeContract.annual_percent)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Jami shartnoma summasi:</span>
                      <span className="font-bold text-slate-900">{formatUSD(activeContract.total_amount)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200/80 pt-2 font-bold text-sm">
                      <span className="text-blue-900">Har oylik to&apos;lov:</span>
                      <span className="text-blue-700">{formatUSD(activeContract.monthly_amount)} / oy</span>
                    </div>
                  </div>

                  {/* Single Contract Excel Export Button */}
                  <button
                    onClick={handleDownloadContractExcel}
                    disabled={downloadingExcel}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-2xl text-xs font-semibold transition disabled:opacity-50 cursor-pointer shadow-2xs"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    {downloadingExcel ? "⏳ Yuklanmoqda..." : "📥 Shartnoma Excel (.xlsx) yuklab olish"}
                  </button>

                  {/* Payment Schedule - Full list without nested max-h scroll */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        To&apos;lovlar jadvali ({activeContract.payments.length} oy)
                      </h4>
                    </div>

                    <div className="space-y-2">
                      {activeContract.payments.map((p) => {
                        const pInfo = getPaymentStatusInfo(p.status);
                        const isPayable = p.status === "pending" || p.status === "partial";
                        // A payment is locked if any prior month (strictly lower month_number) is not yet paid
                        const hasUnpaidPriorMonth = activeContract.payments.some(
                          (prev) => prev.month_number < p.month_number && prev.status !== "paid"
                        );
                        const isLocked = isPayable && hasUnpaidPriorMonth;

                        return (
                          <div
                            key={p.id}
                            className={`p-3.5 rounded-2xl flex items-center justify-between gap-2.5 text-xs transition shadow-2xs ${
                              isLocked
                                ? "bg-slate-50/75 border border-slate-200/60 opacity-80"
                                : "bg-white border border-slate-200/80 hover:border-slate-300"
                            }`}
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex items-center gap-1 font-bold whitespace-nowrap shrink-0 select-none ${isLocked ? "text-slate-600" : "text-slate-900"}`}>
                                  {isLocked && <Lock className="w-3 h-3 text-amber-600 shrink-0" />}
                                  <span>{p.month_number}&#8209;oy</span>
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0 ${pInfo.bg} ${pInfo.text}`}
                                >
                                  {pInfo.label}
                                </span>
                                {isLocked && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200/70 whitespace-nowrap flex items-center gap-1 shrink-0">
                                    Oldingi oy to&apos;lanmagan
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 flex items-center gap-1 whitespace-nowrap">
                                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                                {formatDate(p.due_date)}
                              </p>
                              <div className="text-[11px] text-slate-600 whitespace-nowrap">
                                To&apos;langan:{" "}
                                <span className="text-emerald-600 font-semibold">
                                  {formatUSD(p.paid_amount)}
                                </span>{" "}
                                / Qoldiq:{" "}
                                <span className="text-rose-600 font-semibold">
                                  {formatUSD(p.remaining_amount)}
                                </span>
                              </div>
                              {p.comment && (
                                <div className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50/90 border border-amber-200/70 rounded-lg px-2 py-1 mt-1 font-medium max-w-[260px]">
                                  <MessageSquare className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                  <span className="break-words leading-tight">{p.comment}</span>
                                </div>
                              )}
                            </div>

                            <div className="shrink-0">
                              {isPayable && (
                                isLocked ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="px-3 py-1.5 bg-slate-100 text-slate-400 font-medium rounded-xl text-xs shrink-0 cursor-not-allowed select-none border border-slate-200/80 flex items-center gap-1 whitespace-nowrap"
                                    title="Oldingi oylar to'lovi yopilmaguncha bu oyni to'lab bo'lmaydi"
                                  >
                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                    To&apos;lov
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onPaymentClick(p, car.name, activeContract.driver_name)
                                    }
                                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold rounded-xl shadow-xs transition shrink-0 cursor-pointer text-xs whitespace-nowrap"
                                  >
                                    To&apos;lov
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Early Close Button */}
                  <div className="pt-2">
                    <button
                      onClick={() => setCloseModalOpen(true)}
                      className="w-full py-3 px-4 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer"
                    >
                      ❌ Shartnomani muddatidan oldin yopish
                    </button>
                  </div>
                </div>
              )}

              {/* Past Contracts Summary (if any) */}
              {car.past_contracts && car.past_contracts.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Oldingi shartnomalar ({car.past_contracts.length})
                  </h4>
                  <div className="space-y-2">
                    {car.past_contracts.map((past) => (
                      <div
                        key={past.id}
                        className="p-3 bg-white border border-slate-200/80 rounded-xl text-xs space-y-1 shadow-2xs"
                      >
                        <div className="flex justify-between font-semibold text-slate-800">
                          <span className="capitalize">{past.driver_name}</span>
                          <span className="text-slate-500 text-[11px]">
                            {formatDate(past.start_date)} - {formatDate(past.closed_at)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>
                            {formatUSD(past.monthly_amount)} / oy ({past.months_count} oy)
                          </span>
                          <span className="text-slate-600 italic">
                            {past.close_note || "Yopilgan"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Nested Close Contract Modal */}
      {closeModalOpen && activeContract && car && (
        <CloseContractModal
          contractId={activeContract.id}
          carName={car.name}
          driverName={activeContract.driver_name}
          onClose={() => setCloseModalOpen(false)}
          onSuccess={() => {
            fetchDetail();
            onRefreshParent();
          }}
        />
      )}
    </div>
  );
}
