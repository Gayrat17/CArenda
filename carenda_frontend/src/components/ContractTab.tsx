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
} from "lucide-react";
import { CarListItem, Driver, User as UserType } from "@/types/fleet";
import { createContract } from "@/lib/api";
import { formatUSD } from "@/lib/utils";

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

  // Form State
  const [carId, setCarId] = useState<number | "">(
    selectedCarForRent ? selectedCarForRent.id : availableCars[0]?.id || ""
  );

  const [driverMode, setDriverMode] = useState<"new" | "existing">("new");
  const [driverId, setDriverId] = useState<number | "">(drivers[0]?.id || "");
  const [driverFullName, setDriverFullName] = useState("");
  const [driverPhone, setDriverPhone] = useState("+998");

  const [carPrice, setCarPrice] = useState("10000");
  const [initialPayment, setInitialPayment] = useState("2000");
  const [annualPercent, setAnnualPercent] = useState(
    user?.default_annual_percent || "20.00"
  );
  const [monthsCount, setMonthsCount] = useState<number>(12);

  const todayStr = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(todayStr);
  const [paymentDay, setPaymentDay] = useState<number>(new Date().getDate());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync when selectedCarForRent changes
  useEffect(() => {
    if (selectedCarForRent) {
      setCarId(selectedCarForRent.id);
      if (selectedCarForRent.default_price && parseFloat(selectedCarForRent.default_price) > 0) {
        setCarPrice(parseFloat(selectedCarForRent.default_price).toString());
      }
    } else if (availableCars.length > 0 && !carId) {
      setCarId(availableCars[0].id);
      if (parseFloat(availableCars[0].default_price) > 0) {
        setCarPrice(parseFloat(availableCars[0].default_price).toString());
      }
    }
  }, [selectedCarForRent, availableCars]);

  // Sync user default annual percent
  useEffect(() => {
    if (user?.default_annual_percent && !annualPercent) {
      setAnnualPercent(user.default_annual_percent);
    }
  }, [user]);

  // Live Calculator computation
  const priceVal = parseFloat(carPrice) || 0;
  const initialVal = parseFloat(initialPayment) || 0;
  const percentVal = parseFloat(annualPercent) || 0;
  const monthsVal = monthsCount || 1;

  const principalVal = Math.max(0, priceVal - initialVal);
  const yearsVal = monthsVal / 12;
  const markupVal = principalVal * (percentVal / 100) * yearsVal;
  const totalVal = principalVal + markupVal;
  const monthlyVal = monthsVal > 0 ? totalVal / monthsVal : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!carId) {
      setError("Iltimos, avtomobilni tanlang.");
      return;
    }

    if (driverMode === "new") {
      if (!driverFullName.trim() || !driverPhone.trim()) {
        setError("Iltimos, yangi haydovchining ism-familiyasi va telefonini kiriting.");
        return;
      }
    } else {
      if (!driverId) {
        setError("Iltimos, mavjud haydovchilardan birini tanlang.");
        return;
      }
    }

    if (priceVal <= 0) {
      setError("Mashina narxi 0 dan katta bo'lishi kerak.");
      return;
    }

    if (initialVal >= priceVal) {
      setError("Boshlang'ich to'lov mashina narxidan kam bo'lishi kerak.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = {
        car_id: Number(carId),
        ...(driverMode === "new"
          ? {
              driver_full_name: driverFullName.trim(),
              driver_phone: driverPhone.trim(),
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

      await createContract(payload);
      onSuccess(Number(carId));
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
          Avtomobilni ijaraga berish va to'lov grafigini shakllantirish
        </p>
      </div>

      {availableCars.length === 0 ? (
        <div className="p-8 bg-white border border-slate-100 rounded-3xl text-center space-y-3">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">
              Bo'sh mashinalar mavjud emas
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
              Shartnoma tuzish uchun avval parkka yangi mashina qo'shing yoki mavjud mashinani bo'shating.
            </p>
          </div>
          <button
            onClick={onNavigateCars}
            className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition"
          >
            Mashinalar bo'limiga o'tish
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Select Car */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
              1. Mashinani tanlang *
            </label>
            <select
              required
              value={carId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setCarId(id);
                const selected = availableCars.find((c) => c.id === id);
                if (selected && parseFloat(selected.default_price) > 0) {
                  setCarPrice(parseFloat(selected.default_price).toString());
                }
              }}
              className="w-full px-3.5 py-2.5 text-sm font-medium bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              {availableCars.map((car) => (
                <option key={car.id} value={car.id}>
                  {car.name} ({car.plate_number}) — {formatUSD(car.default_price)}
                </option>
              ))}
            </select>
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
                  <input
                    type="text"
                    required
                    value={driverFullName}
                    onChange={(e) => setDriverFullName(e.target.value)}
                    placeholder="Haydovchi F.I.SH (masalan: Ali Valiyev)"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    required
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
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
                        {d.full_name} ({d.phone})
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
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={carPrice}
                    onChange={(e) => setCarPrice(e.target.value)}
                    placeholder="10000"
                    className="w-full pl-7 pr-3 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Boshlang'ich to'lov ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={initialPayment}
                    onChange={(e) => setInitialPayment(e.target.value)}
                    placeholder="0"
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
                    step="0.01"
                    min="0"
                    required
                    value={annualPercent}
                    onChange={(e) => setAnnualPercent(e.target.value)}
                    placeholder="20.00"
                    className="w-full px-3 py-2 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Oylik to'lov kuni (1-31) *
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
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                <p className="text-[10px] text-slate-400">Jami to'lanadigan summa:</p>
                <p className="font-bold text-white text-sm">{formatUSD(totalVal)}</p>
              </div>
            </div>

            {/* Prominent Monthly Amount */}
            <div className="p-3 bg-white/10 rounded-2xl flex items-center justify-between border border-white/10">
              <div>
                <p className="text-[10px] text-blue-200 uppercase font-medium">Har oylik to'lov</p>
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
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5" />
            {loading ? "Shartnoma tuzilmoqda..." : "Shartnomani tasdiqlash va tuzish"}
          </button>
        </form>
      )}
    </div>
  );
}
