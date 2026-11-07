"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Phone,
  Calendar,
  DollarSign,
  AlertCircle,
  FileText,
  Wrench,
  CheckCircle,
  Clock,
} from "lucide-react";
import { getCarDetail, updateCar } from "@/lib/api";
import { CarDetail, Payment } from "@/types/fleet";
import {
  formatDate,
  formatUSD,
  getCarStatusInfo,
  getPaymentStatusInfo,
} from "@/lib/utils";
import { CloseContractModal } from "./CloseContractModal";

interface CarDetailModalProps {
  carId: number | null;
  onClose: () => void;
  onRentClick: (car: CarDetail) => void;
  onPaymentClick: (payment: Payment, carName: string, driverName: string) => void;
  onRefreshParent: () => void;
}

export function CarDetailModal({
  carId,
  onClose,
  onRentClick,
  onPaymentClick,
  onRefreshParent,
}: CarDetailModalProps) {
  const [car, setCar] = useState<CarDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  const fetchDetail = async () => {
    if (!carId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getCarDetail(carId);
      setCar(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Avtomobil ma'lumotlarini yuklashda xatolik.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [carId]);

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

  const statusInfo = car ? getCarStatusInfo(car.status) : null;
  const activeContract = car?.active_contract;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div>
            <h3 className="font-bold text-slate-900 text-lg leading-tight">
              {car?.name || "Mashina ma'lumotlari"}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md">
                {car?.plate_number}
              </span>
              {statusInfo && (
                <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                  {statusInfo.label}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Yuklanmoqda...</p>
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
              {/* STATUS: AVAILABLE or MAINTENANCE */}
              {car.status !== "rented" && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Standart narxi:</span>
                      <span className="font-semibold text-slate-900 text-sm">
                        {formatUSD(car.default_price)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">Qo'shilgan sana:</span>
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
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-sm transition"
                      >
                        <FileText className="w-4 h-4" />
                        Ijaraga berish (Shartnoma tuzish)
                      </button>
                    ) : (
                      <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-xl flex items-center gap-2">
                        <Wrench className="w-4 h-4 shrink-0" />
                        <span>Avtomobil hozirda ta'mirda. Yangi shartnoma tuzish uchun uni bo'sh holatga o'tkazing.</span>
                      </div>
                    )}

                    <button
                      onClick={handleToggleMaintenance}
                      className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition flex items-center justify-center gap-2"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      {car.status === "available" ? "Ta'mirga o'tkazish" : "Bo'sh deb belgilash"}
                    </button>
                  </div>
                </div>
              )}

              {/* STATUS: RENTED (Active Contract & Schedule) */}
              {car.status === "rented" && activeContract && (
                <div className="space-y-4">
                  {/* Driver Card */}
                  <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-medium text-blue-600 uppercase tracking-wide">
                        Faol Ijara Haydovchisi
                      </p>
                      <h4 className="font-semibold text-slate-900 text-base mt-0.5">
                        {activeContract.driver_name}
                      </h4>
                      <p className="text-xs text-slate-600 font-mono mt-0.5">
                        {activeContract.driver_phone}
                      </p>
                    </div>
                    <a
                      href={`tel:${activeContract.driver_phone}`}
                      className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm transition shrink-0"
                      title="Qo'ng'iroq qilish"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  </div>

                  {/* Contract Financial Breakdown */}
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mashina narxi:</span>
                      <span className="font-medium text-slate-800">{formatUSD(activeContract.car_price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Boshlang'ich to'lov:</span>
                      <span className="font-medium text-emerald-600">
                        {formatUSD(activeContract.initial_payment)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Qarz summasi (Asosiy):</span>
                      <span className="font-medium text-slate-800">
                        {formatUSD(activeContract.principal_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Yillik ustama foiz:</span>
                      <span className="font-medium text-slate-800">{activeContract.annual_percent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Jami shartnoma summasi:</span>
                      <span className="font-semibold text-slate-900">{formatUSD(activeContract.total_amount)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/80 pt-2 font-bold text-sm">
                      <span className="text-blue-900">Har oylik to'lov:</span>
                      <span className="text-blue-700">{formatUSD(activeContract.monthly_amount)} / oy</span>
                    </div>
                  </div>

                  {/* Payment Schedule */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        To'lovlar jadvali ({activeContract.payments.length} oy)
                      </h4>
                    </div>

                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {activeContract.payments.map((p) => {
                        const pInfo = getPaymentStatusInfo(p.status);
                        const isPayable = p.status === "pending" || p.status === "partial";

                        return (
                          <div
                            key={p.id}
                            className="p-3 bg-white border border-slate-100 hover:border-slate-200 rounded-xl flex items-center justify-between text-xs transition"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{p.month_number}-oy</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${pInfo.bg} ${pInfo.text}`}>
                                  {pInfo.label}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDate(p.due_date)}
                              </p>
                              <div className="text-[11px] text-slate-600">
                                To'langan: <span className="text-emerald-600 font-medium">{formatUSD(p.paid_amount)}</span> /{" "}
                                Qoldiq: <span className="text-rose-600 font-medium">{formatUSD(p.remaining_amount)}</span>
                              </div>
                            </div>

                            {isPayable && (
                              <button
                                onClick={() =>
                                  onPaymentClick(p, car.name, activeContract.driver_name)
                                }
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-xs transition shrink-0"
                              >
                                To'lov
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Early Close Button */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setCloseModalOpen(true)}
                      className="w-full py-2.5 px-4 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 rounded-xl transition"
                    >
                      ❌ Shartnomani muddatidan oldin yopish
                    </button>
                  </div>
                </div>
              )}

              {/* Past Contracts Summary (if any) */}
              {car.past_contracts && car.past_contracts.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Oldingi shartnomalar ({car.past_contracts.length})
                  </h4>
                  <div className="space-y-2">
                    {car.past_contracts.map((past) => (
                      <div
                        key={past.id}
                        className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs space-y-0.5"
                      >
                        <div className="flex justify-between font-medium text-slate-800">
                          <span>{past.driver_name}</span>
                          <span className="text-slate-500">{formatDate(past.start_date)} - {formatDate(past.closed_at)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-500">
                          <span>{formatUSD(past.monthly_amount)} / oy ({past.months_count} oy)</span>
                          <span className="text-slate-600 italic">{past.close_note || "Yopilgan"}</span>
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
