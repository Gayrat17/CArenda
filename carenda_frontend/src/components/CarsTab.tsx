"use client";

import React, { useState } from "react";
import { Plus, Car as CarIcon, Calendar, User, ChevronRight } from "lucide-react";
import { CarListItem } from "@/types/fleet";
import { formatDate, formatUSD, getCarStatusInfo } from "@/lib/utils";

interface CarsTabProps {
  cars: CarListItem[];
  loading: boolean;
  onNavigateTab: (tab: "dashboard" | "cars" | "contract" | "settings") => void;
  onSelectCar: (carId: number) => void;
}

export function CarsTab({
  cars,
  loading,
  onNavigateTab,
  onSelectCar,
}: CarsTabProps) {
  const [filter, setFilter] = useState<"all" | "available" | "rented" | "maintenance">("all");

  const filteredCars = cars.filter((car) => {
    if (filter === "all") return true;
    return car.status === filter;
  });

  return (
    <div className="space-y-4">
      {/* Header (No standalone Add Car button) */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 leading-tight">
          Avtomobillar
        </h1>
        <p className="text-xs text-slate-500">
          Jami {cars.length} ta mashina
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex p-1 bg-slate-200/70 rounded-xl text-xs font-medium text-slate-600">
        <button
          onClick={() => setFilter("all")}
          className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
            filter === "all" ? "bg-white text-slate-900 font-semibold shadow-xs" : "hover:text-slate-900"
          }`}
        >
          Barchasi ({cars.length})
        </button>
        <button
          onClick={() => setFilter("available")}
          className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
            filter === "available" ? "bg-white text-emerald-700 font-semibold shadow-xs" : "hover:text-slate-900"
          }`}
        >
          Bo&apos;sh ({cars.filter((c) => c.status === "available").length})
        </button>
        <button
          onClick={() => setFilter("rented")}
          className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
            filter === "rented" ? "bg-white text-blue-700 font-semibold shadow-xs" : "hover:text-slate-900"
          }`}
        >
          Ijarada ({cars.filter((c) => c.status === "rented").length})
        </button>
        <button
          onClick={() => setFilter("maintenance")}
          className={`flex-1 py-1.5 rounded-lg transition cursor-pointer ${
            filter === "maintenance" ? "bg-white text-amber-700 font-semibold shadow-xs" : "hover:text-slate-900"
          }`}
        >
          Ta&apos;mirda ({cars.filter((c) => c.status === "maintenance").length})
        </button>
      </div>

      {/* Car List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Mashinalar yuklanmoqda...</p>
        </div>
      ) : filteredCars.length === 0 ? (
        <div className="p-8 bg-white border border-slate-100 rounded-3xl text-center space-y-3">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <CarIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">
              {cars.length === 0 ? "Avtomobillar mavjud emas" : "Mashina topilmadi"}
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
              {cars.length === 0
                ? "Avtomobillar mavjud emas. Yangi shartnoma tuzish orqali birinchi mashinangizni qo'shing."
                : "Ushbu filtr bo'yicha avtomobillar topilmadi."}
            </p>
          </div>
          {cars.length === 0 && (
            <button
              onClick={() => onNavigateTab("contract")}
              className="inline-flex items-center gap-1.5 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              ➕ Yangi shartnoma tuzish
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredCars.map((car) => {
            const statusInfo = getCarStatusInfo(car.status);
            const activeContract = car.active_contract_summary;

            return (
              <div
                key={car.id}
                onClick={() => onSelectCar(car.id)}
                className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-blue-200 cursor-pointer shadow-xs transition space-y-2.5 group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition">
                      {car.name}
                    </h3>
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-800 rounded">
                      {car.plate_number}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[11px] px-2.5 py-1 rounded-full font-semibold border ${statusInfo.bg} ${statusInfo.text}`}
                    >
                      {statusInfo.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition" />
                  </div>
                </div>

                {/* Status-specific info */}
                {car.status === "rented" && activeContract ? (
                  <div className="pt-2 border-t border-slate-100 text-xs flex justify-between items-center text-slate-600">
                    <span className="flex items-center gap-1 text-slate-800 font-medium">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {activeContract.driver_name}
                    </span>
                    <div className="text-right">
                      <span className="font-bold text-blue-700">
                        {formatUSD(activeContract.monthly_amount)} / oy
                      </span>
                      {activeContract.next_due_date && (
                        <p className="text-[10px] text-slate-400 flex items-center justify-end gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          To&apos;lov: {formatDate(activeContract.next_due_date)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-100 text-xs flex justify-between items-center text-slate-500">
                    <span>Standart narxi: <span className="font-semibold text-slate-800">{formatUSD(car.default_price)}</span></span>
                    {car.status === "available" && (
                      <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                        Ijaraga tayyor
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
