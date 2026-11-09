"use client";

import React, { useState, useMemo } from "react";
import { Plus, FileText, Calendar, User, ChevronRight } from "lucide-react";
import { CarListItem } from "@/types/fleet";
import { formatDate, formatUSD, getContractStatusInfo } from "@/lib/utils";

export type ContractFilter = "all" | "active" | "overdue" | "closed";

interface CarsTabProps {
  cars: CarListItem[];
  loading: boolean;
  overdueContractIds?: Set<number>;
  onNavigateTab: (tab: "dashboard" | "cars" | "contract" | "settings") => void;
  onSelectCar: (carId: number) => void;
}

export function CarsTab({
  cars,
  loading,
  overdueContractIds = new Set(),
  onNavigateTab,
  onSelectCar,
}: CarsTabProps) {
  const [filter, setFilter] = useState<ContractFilter>("all");

  // Determine contract status for each car item
  const getItemStatus = (car: CarListItem) => {
    const hasActiveContract = Boolean(
      car.status === "rented" && car.active_contract_summary
    );
    const isOverdue = Boolean(
      hasActiveContract &&
        car.active_contract_summary?.contract_id &&
        overdueContractIds.has(car.active_contract_summary.contract_id)
    );
    return getContractStatusInfo(hasActiveContract, isOverdue);
  };

  // Precompute tab counts
  const counts = useMemo(() => {
    let active = 0;
    let overdue = 0;
    let closed = 0;

    for (const car of cars) {
      const status = getItemStatus(car);
      if (status.key === "active") active++;
      else if (status.key === "overdue") overdue++;
      else if (status.key === "closed") closed++;
    }

    return {
      all: cars.length,
      active,
      overdue,
      closed,
    };
  }, [cars, overdueContractIds]);

  // Filtered cars list
  const filteredCars = useMemo(() => {
    if (filter === "all") return cars;
    return cars.filter((car) => getItemStatus(car).key === filter);
  }, [cars, filter, overdueContractIds]);

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 leading-tight">
          Shartnomalar
        </h1>
        <p className="text-xs text-slate-500">
          Jami {cars.length} ta shartnoma
        </p>
      </div>

      {/* Status Filter Tabs (Single-Line Horizontal Layout with no-scrollbar) */}
      <div className="flex overflow-x-auto no-scrollbar gap-1 p-1 bg-slate-200/70 rounded-xl text-xs font-medium text-slate-600">
        <button
          onClick={() => setFilter("all")}
          className={`whitespace-nowrap flex-1 py-1.5 px-2.5 rounded-lg transition cursor-pointer text-center shrink-0 sm:shrink ${
            filter === "all"
              ? "bg-white text-slate-900 font-semibold shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Barchasi ({counts.all})
        </button>
        <button
          onClick={() => setFilter("active")}
          className={`whitespace-nowrap flex-1 py-1.5 px-2.5 rounded-lg transition cursor-pointer text-center shrink-0 sm:shrink ${
            filter === "active"
              ? "bg-white text-blue-600 font-semibold shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Faol ({counts.active})
        </button>
        <button
          onClick={() => setFilter("overdue")}
          className={`whitespace-nowrap flex-1 py-1.5 px-2.5 rounded-lg transition cursor-pointer text-center shrink-0 sm:shrink ${
            filter === "overdue"
              ? "bg-white text-rose-700 font-semibold shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Qarzdorlar ({counts.overdue})
        </button>
        <button
          onClick={() => setFilter("closed")}
          className={`whitespace-nowrap flex-1 py-1.5 px-2.5 rounded-lg transition cursor-pointer text-center shrink-0 sm:shrink ${
            filter === "closed"
              ? "bg-white text-slate-800 font-semibold shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Yopilgan ({counts.closed})
        </button>
      </div>

      {/* Contract / Cars List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Shartnomalar yuklanmoqda...</p>
        </div>
      ) : filteredCars.length === 0 ? (
        <div className="p-8 bg-white border border-slate-100 rounded-3xl text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">
              {cars.length === 0 ? "Shartnomalar mavjud emas" : "Shartnoma topilmadi"}
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
              {cars.length === 0
                ? "Shartnomalar mavjud emas. Yangi shartnoma tuzish orqali birinchi mashinangizni qo'shing."
                : "Ushbu filtr bo'yicha shartnomalar mavjud emas."}
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
            const statusInfo = getItemStatus(car);
            const activeContract = car.active_contract_summary;

            return (
              <div
                key={car.id}
                onClick={() => onSelectCar(car.id)}
                className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-blue-200 cursor-pointer shadow-xs transition space-y-2 group"
              >
                {/* Top Row: Car Model + Year badge (Left) | Status Badge + Chevron (Right) */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className="font-bold text-base text-slate-900 truncate group-hover:text-blue-600 transition">
                      {car.name}
                    </h3>
                    {car.year && (
                      <span className="shrink-0 bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-md font-medium">
                        {car.year}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}
                    >
                      {statusInfo.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition" />
                  </div>
                </div>

                {/* Middle Row: License Plate badge + optional notes badge */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-800 font-medium">
                    {car.plate_number}
                  </span>
                  {car.notes && (
                    <span className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                      {car.notes}
                    </span>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-slate-100 my-2.5" />

                {/* Bottom Row: Client Full Name (Left) | Monthly & Next Payment (Right) */}
                {car.status === "rented" && activeContract ? (
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 text-slate-800 min-w-0">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="capitalize font-medium text-slate-800 truncate max-w-[150px]">
                        {activeContract.driver_name}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-blue-600 text-sm">
                        {formatUSD(activeContract.monthly_amount)} / oy
                      </div>
                      {activeContract.next_due_date && (
                        <div className="text-xs text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>To&apos;lov: {formatDate(activeContract.next_due_date)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="italic text-slate-400">Shartnoma yakunlangan</span>
                    <span className="font-semibold text-slate-600">
                      Standart: {formatUSD(car.default_price)}
                    </span>
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
