"use client";

import React, { useEffect, useState } from "react";
import {
  FileText,
  Calculator,
  User,
  Car,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { CarListItem, Driver, User as UserType, CreateContractPayload } from "@/types/fleet";
import { createContract } from "@/lib/api";
import {
  formatUSD,
  formatPercent,
  getLocalDateString,
  formatPlateNumber,
  isValidPlateNumber,
  formatUzbekPhone,
  isValidUzbekPhone,
  formatMoneyInput,
  parseMoneyValue,
} from "@/lib/utils";

interface ContractTabProps {
  user: UserType | null;
  cars: CarListItem[];
  drivers: Driver[];
  selectedCarForRent?: CarListItem | null;
  onSuccess: (carId: number) => void;
  onNavigateCars: () => void;
}

export function ContractTab({
  user,
  cars,
  drivers,
  selectedCarForRent,
  onSuccess,
  onNavigateCars,
}: ContractTabProps) {
  const availableCars = cars.filter((c) => c.status === "available");

  // Form State: Car Details
  const [carId, setCarId] = useState<number | "">(
    selectedCarForRent ? selectedCarForRent.id : ""
  );
  const [carName, setCarName] = useState(
    selectedCarForRent ? selectedCarForRent.name : ""
  );
  const [plateNumber, setPlateNumber] = useState(
    selectedCarForRent ? selectedCarForRent.plate_number : ""
  );
  const [carYear, setCarYear] = useState(
    selectedCarForRent?.year ? String(selectedCarForRent.year) : ""
  );
  const [carNotes, setCarNotes] = useState(
    selectedCarForRent?.notes || ""
  );

  // Driver State
  const [driverMode, setDriverMode] = useState<"new" | "existing">("new");
  const [driverId, setDriverId] = useState<number | "">(drivers[0]?.id || "");
  const [driverFullName, setDriverFullName] = useState("");
  const [driverPhone, setDriverPhone] = useState("+998 ");
  const [driverSecondaryPhone, setDriverSecondaryPhone] = useState("+998 ");
  const [showSecondaryPhone, setShowSecondaryPhone] = useState(false);

  // Financials - blank by default as requested
  const [carPrice, setCarPrice] = useState("");
  const [initialPayment, setInitialPayment] = useState("");
  const [annualPercent, setAnnualPercent] = useState(() =>
    formatPercent(user?.default_annual_percent) || "20"
  );
  const [monthsCount, setMonthsCount] = useState<number>(12);

  // Use local calendar date to avoid UTC shift showing yesterday's date
  const [startDate, setStartDate] = useState(() => getLocalDateString());
  const [paymentDay, setPaymentDay] = useState<number>(() => new Date().getDate());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when selectedCarForRent changes
  useEffect(() => {
    if (selectedCarForRent) {
      setCarId(selectedCarForRent.id);
      setCarName(selectedCarForRent.name);
      setPlateNumber(selectedCarForRent.plate_number);
      setCarYear(selectedCarForRent.year ? String(selectedCarForRent.year) : "");
      setCarNotes(selectedCarForRent.notes || "");
      if (selectedCarForRent.default_price && parseFloat(selectedCarForRent.default_price) > 0) {
        setCarPrice(formatMoneyInput(selectedCarForRent.default_price));
      }
    }
  }, [selectedCarForRent]);

  // Sync user default annual percent immediately whenever settings update
  useEffect(() => {
    if (user?.default_annual_percent !== undefined && user?.default_annual_percent !== null) {
      setAnnualPercent(formatPercent(user.default_annual_percent));
    }
  }, [user?.default_annual_percent]);

  const handleSelectQuickCar = (car: CarListItem) => {
    if (carId === car.id) {
      // Toggle off / clear selection to allow entering a new car
      setCarId("");
      setCarName("");
      setPlateNumber("");
      setCarYear("");
      setCarNotes("");
    } else {
      setCarId(car.id);
      setCarName(car.name);
      setPlateNumber(car.plate_number);
      setCarYear(car.year ? String(car.year) : "");
      setCarNotes(car.notes || "");
      if (car.default_price && parseFloat(car.default_price) > 0) {
        setCarPrice(formatMoneyInput(car.default_price));
      }
    }
  };

  // Live Calculator computation
  const priceVal = parseMoneyValue(carPrice);
  const initialVal = parseMoneyValue(initialPayment);
  const percentVal = Math.round(parseFloat(annualPercent)) || 0;
  const monthsVal = monthsCount || 1;

  const principalVal = Math.max(0, priceVal - initialVal);
  const yearsVal = monthsVal / 12;
  const markupVal = principalVal * (percentVal / 100) * yearsVal;
  const totalVal = principalVal + markupVal;
  const monthlyVal = monthsVal > 0 ? totalVal / monthsVal : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!carId) {
      if (!carName.trim()) {
        setError("Iltimos, mashina nomini kiriting.");
        return;
      }
      if (!plateNumber.trim()) {
        setError("Iltimos, mashina davlat raqamini kiriting.");
        return;
      }
      if (!isValidPlateNumber(plateNumber)) {
        setError("Davlat raqami formati noto'g'ri. Namuna: 01 A 777 AA yoki 01 777 AAA");
        return;
      }
    }

    const secondaryDigits = driverSecondaryPhone.replace(/\D/g, "");
    const secondaryNational = secondaryDigits.startsWith("998")
      ? secondaryDigits.slice(3)
      : secondaryDigits;

    if (driverMode === "new") {
      if (!driverFullName.trim()) {
        setError("Iltimos, yangi haydovchining ism-familiyasini kiriting.");
        return;
      }
      if (!isValidUzbekPhone(driverPhone)) {
        setError("Haydovchi telefon raqami to'liq kiritilishi shart (+998 XX XXX XX XX).");
        return;
      }
      if (showSecondaryPhone && secondaryNational.length > 0 && secondaryNational.length < 9) {
        setError("Qo'shimcha telefon raqami to'liq kiritilishi shart (+998 XX XXX XX XX) yoki o'chirib tashlang.");
        return;
      }
    } else {
      if (!driverId) {
        setError("Iltimos, mavjud haydovchilardan birini tanlang.");
        return;
      }
    }

    if (!carPrice || priceVal <= 0) {
      setError("Mashina narxi kiritilishi shart (0 dan katta bo'lishi kerak).");
      return;
    }

    if (initialVal >= priceVal) {
      setError("Boshlang'ich to'lov mashina narxidan kam bo'lishi kerak.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload: CreateContractPayload = {
        ...(carId ? { car_id: Number(carId) } : {}),
        car_name: carName.trim(),
        plate_number: plateNumber.trim().toUpperCase(),
        car_year: carYear ? parseInt(carYear, 10) : null,
        car_notes: carNotes.trim(),
        ...(driverMode === "new"
          ? {
              driver_full_name: driverFullName.trim(),
              driver_phone: driverPhone.trim(),
              driver_secondary_phone:
                showSecondaryPhone && secondaryNational.length === 9
                  ? driverSecondaryPhone.trim()
                  : "",
            }
          : {
              driver_id: Number(driverId),
            }),
        car_price: priceVal,
        initial_payment: initialVal,
        annual_percent: percentVal,
        months_count: monthsVal,
        payment_day: paymentDay,
        start_date: startDate,
      };

      const contract = await createContract(payload);
      onSuccess(contract.car || (carId ? Number(carId) : 0));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Shartnoma tuzishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 leading-tight">
          Yangi Shartnoma
        </h1>
        <p className="text-xs text-slate-500">
          Avtomobilni kiritish, ijaraga berish va to&apos;lov grafigini shakllantirish
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Inline Car Details & Optional Quick Select */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
              1. Avtomobil ma&apos;lumotlari *
            </label>
            {carId ? (
              <button
                type="button"
                onClick={() => {
                  setCarId("");
                  setCarName("");
                  setPlateNumber("");
                }}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
              >
                Yangi mashina kiritish
              </button>
            ) : null}
          </div>

          {/* Quick-select chips if available cars exist in the fleet */}
          {availableCars.length > 0 && (
            <div className="space-y-1.5 pb-1">
              <span className="text-[11px] text-slate-500 font-medium block">
                Parkdagi bo&apos;sh mashinalar (tezkor tanlash):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availableCars.map((car) => {
                  const isSelected = carId === car.id;
                  return (
                    <button
                      key={car.id}
                      type="button"
                      onClick={() => handleSelectQuickCar(car)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      🚗 {car.name} ({car.plate_number})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Mashina modeli / nomi *
              </label>
              <input
                type="text"
                required
                value={carName}
                onChange={(e) => {
                  setCarName(e.target.value);
                  if (carId) setCarId("");
                }}
                placeholder="Chevrolet Cobalt"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-slate-600">
                  Davlat raqami *
                </label>
                {plateNumber && (
                  <span
                    className={`text-[10px] font-semibold ${
                      isValidPlateNumber(plateNumber) ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {isValidPlateNumber(plateNumber) ? "✓ To'g'ri format" : "Format: 01 A 777 AA"}
                  </span>
                )}
              </div>
              <input
                type="text"
                required
                value={plateNumber}
                onChange={(e) => {
                  setPlateNumber(formatPlateNumber(e.target.value));
                  if (carId) setCarId("");
                }}
                placeholder="01 A 777 AA"
                className="w-full px-3.5 py-2.5 text-sm uppercase font-mono font-bold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Ishlab chiqarilgan yili (ixtiyoriy)
              </label>
              <input
                type="number"
                min="1990"
                max="2099"
                value={carYear}
                onChange={(e) => {
                  setCarYear(e.target.value);
                  if (carId) setCarId("");
                }}
                placeholder="2023"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Alohida belgilari / Izoh (ixtiyoriy)
              </label>
              <input
                type="text"
                value={carNotes}
                onChange={(e) => {
                  setCarNotes(e.target.value);
                  if (carId) setCarId("");
                }}
                placeholder="Gaz o'rnatilgan, oq rang"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* 2. Driver Selection / Inline Creation */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
              2. Haydovchi *
            </label>
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setDriverMode("new")}
                className={`px-2.5 py-1 rounded-md transition ${
                  driverMode === "new" ? "bg-white text-blue-700 font-semibold shadow-xs" : "text-slate-600"
                }`}
              >
                Yangi
              </button>
              <button
                type="button"
                onClick={() => setDriverMode("existing")}
                className={`px-2.5 py-1 rounded-md transition ${
                  driverMode === "existing" ? "bg-white text-blue-700 font-semibold shadow-xs" : "text-slate-600"
                }`}
              >
                Mavjud ({drivers.length})
              </button>
            </div>
          </div>

          {driverMode === "new" ? (
            <div className="grid grid-cols-1 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Haydovchi F.I.SH *
                </label>
                <input
                  type="text"
                  required
                  value={driverFullName}
                  onChange={(e) => setDriverFullName(e.target.value)}
                  placeholder="Ali Valiyev"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div className="space-y-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-medium text-slate-600">
                      Asosiy telefon raqami *
                    </label>
                    {driverPhone.trim() && driverPhone.trim() !== "+998" && (
                      <span
                        className={`text-[10px] font-semibold ${
                          isValidUzbekPhone(driverPhone) ? "text-emerald-600" : "text-amber-600"
                        }`}
                      >
                        {isValidUzbekPhone(driverPhone) ? "✓ To'liq kiritildi" : "XX XXX XX XX"}
                      </span>
                    )}
                  </div>
                  <input
                    type="tel"
                    required
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(formatUzbekPhone(e.target.value, false))}
                    onKeyDown={(e) => {
                      const input = e.currentTarget;
                      if (
                        e.key === "Backspace" &&
                        (input.selectionStart ?? 0) <= 5 &&
                        (input.selectionEnd ?? 0) <= 5
                      ) {
                        e.preventDefault();
                      }
                    }}
                    placeholder="+998 90 123 45 67"
                    className="w-full px-3.5 py-2.5 text-sm font-mono font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {!showSecondaryPhone ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSecondaryPhone(true);
                        setDriverSecondaryPhone("+998 ");
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 py-1.5 px-3 rounded-xl border border-dashed border-blue-200 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Qo&apos;shimcha telefon raqami qo&apos;shish
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-medium text-slate-700">
                        Qo&apos;shimcha telefon raqami (ixtiyoriy)
                      </label>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const secDigits = driverSecondaryPhone.replace(/\D/g, "");
                          const secNational = secDigits.startsWith("998") ? secDigits.slice(3) : secDigits;
                          if (secNational.length === 0) {
                            return <span className="text-[10px] text-slate-400 font-normal">Ixtiyoriy</span>;
                          }
                          return (
                            <span
                              className={`text-[10px] font-semibold ${
                                secNational.length === 9 ? "text-emerald-600" : "text-amber-600"
                              }`}
                            >
                              {secNational.length === 9 ? "✓ To'liq" : "XX XXX XX XX"}
                            </span>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => {
                            setShowSecondaryPhone(false);
                            setDriverSecondaryPhone("+998 ");
                          }}
                          className="text-xs text-rose-600 hover:text-rose-700 font-semibold hover:underline"
                        >
                          ✕ Bekor qilish
                        </button>
                      </div>
                    </div>
                    <input
                      type="tel"
                      value={driverSecondaryPhone}
                      onChange={(e) => setDriverSecondaryPhone(formatUzbekPhone(e.target.value, false))}
                      onKeyDown={(e) => {
                        const input = e.currentTarget;
                        if (
                          e.key === "Backspace" &&
                          (input.selectionStart ?? 0) <= 5 &&
                          (input.selectionEnd ?? 0) <= 5
                        ) {
                          e.preventDefault();
                        }
                      }}
                      placeholder="+998 93 987 65 43"
                      className="w-full px-3.5 py-2.5 text-sm font-mono font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {drivers.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-2 bg-slate-50 rounded-lg">
                  Avvalroq kiritilgan haydovchilar mavjud emas. Yangi haydovchi kiriting.
                </p>
              ) : (
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-sm font-medium bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.phone}{d.secondary_phone ? `, ${d.secondary_phone}` : ""})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* 3. Financial Inputs (USD) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
          <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
            3. Moliyaviy Shartlar ($ USD)
          </label>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Mashina narxi ($) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={carPrice}
                  onChange={(e) => setCarPrice(formatMoneyInput(e.target.value))}
                  className="w-full pl-7 pr-3 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Boshlang&apos;ich to&apos;lov ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={initialPayment}
                  onChange={(e) => setInitialPayment(formatMoneyInput(e.target.value))}
                  className="w-full pl-7 pr-3 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Yillik ustama foiz (%) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  required
                  value={annualPercent}
                  onChange={(e) => setAnnualPercent(e.target.value)}
                  className="w-full px-3 pr-8 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold pointer-events-none select-none">%</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Oylik to&apos;lov kuni (1-31) *
              </label>
              <input
                type="number"
                min="1"
                max="31"
                required
                value={paymentDay}
                onChange={(e) => setPaymentDay(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Months Count & Quick Presets */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[11px] font-medium text-slate-600">
                Muddat (oylarda): <span className="font-bold text-slate-900">{monthsCount} oy</span>
              </label>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[6, 12, 24, 36].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonthsCount(m)}
                  className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition ${
                    monthsCount === m
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {m} oy
                </button>
              ))}
            </div>

            <input
              type="range"
              min="1"
              max="60"
              value={monthsCount}
              onChange={(e) => setMonthsCount(parseInt(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Shartnoma boshlanish sanasi *
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => {
                const val = e.target.value;
                setStartDate(val);
                if (val) {
                  const parts = val.split("-");
                  if (parts.length === 3) {
                    const parsedDay = parseInt(parts[2], 10);
                    if (!isNaN(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
                      setPaymentDay(parsedDay);
                    }
                  }
                }
              }}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
            />
          </div>
        </div>

        {/* 4. Live Calculator Preview Card */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-5 rounded-3xl shadow-md space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-300 uppercase tracking-wider">
            <Calculator className="w-4 h-4" />
            Jonli Hisob-kitob Natijasi
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
            <div>
              <p className="text-[10px] text-slate-400">Qoldiq qarz (Asosiy):</p>
              <p className="font-semibold text-white">{formatUSD(principalVal)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400">Yillik ustama ({percentVal}%):</p>
              <p className="font-semibold text-emerald-400">+{formatUSD(markupVal)}</p>
            </div>
            <div className="col-span-2 pt-1 border-t border-white/10">
              <p className="text-[10px] text-slate-400">Jami to&apos;lanadigan summa:</p>
              <p className="font-bold text-white text-sm">{formatUSD(totalVal)}</p>
            </div>
          </div>

          {/* Prominent Monthly Amount */}
          <div className="p-3 bg-white/10 rounded-2xl flex items-center justify-between border border-white/10">
            <div>
              <p className="text-[10px] text-blue-200 uppercase font-medium">Har oylik to&apos;lov</p>
              <p className="text-xl font-black text-white">{formatUSD(monthlyVal)}</p>
            </div>
            <span className="text-xs font-semibold text-blue-200 bg-white/10 px-2.5 py-1 rounded-full">
              {monthsVal} oy davomida
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition disabled:opacity-50 cursor-pointer"
        >
          <CheckCircle2 className="w-5 h-5" />
          {loading ? "Shartnoma tuzilmoqda..." : "Shartnomani tasdiqlash va tuzish"}
        </button>
      </form>
    </div>
  );
}
