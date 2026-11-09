"use client";

import React, { useState } from "react";
import { X, Car as CarIcon, PlusCircle } from "lucide-react";
import { createCar } from "@/lib/api";
import {
  formatPlateNumber,
  isValidPlateNumber,
  formatMoneyInput,
  parseMoneyValue,
} from "@/lib/utils";

interface AddCarModalProps {
  canAddCar: boolean;
  carsCount: number;
  carsLimit: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddCarModal({
  canAddCar,
  carsCount,
  carsLimit,
  onClose,
  onSuccess,
}: AddCarModalProps) {
  const [name, setName] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [year, setYear] = useState("");
  const [notes, setNotes] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Iltimos, mashina nomini kiriting.");
      return;
    }

    if (!plateNumber.trim()) {
      setError("Iltimos, davlat raqamini kiriting.");
      return;
    }

    if (!isValidPlateNumber(plateNumber)) {
      setError("Davlat raqami formati noto'g'ri. Namuna: 01 A 777 AA yoki 01 777 AAA");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await createCar({
        name: name.trim(),
        plate_number: plateNumber.trim().toUpperCase(),
        year: year ? parseInt(year, 10) : null,
        notes: notes.trim(),
        default_price: defaultPrice ? parseMoneyValue(defaultPrice) : 0,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Mashina qo'shishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-full">
              <CarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-base">Yangi mashina qo'shish</h3>
              <p className="text-xs text-slate-500">
                Limit: {carsCount} / {carsLimit} mashina
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!canAddCar && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl">
              ⚠️ Tarifingiz bo'yicha mashinalar limiti to'lgan yoki obuna muddati tugagan.
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Mashina nomi / modeli *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chevrolet Gentra 1.5"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Davlat raqami (Plate number) *
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
              onChange={(e) => setPlateNumber(formatPlateNumber(e.target.value))}
              placeholder="01 A 777 AA"
              className="w-full px-3.5 py-2.5 text-sm font-mono font-bold uppercase bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Yili (ixtiyoriy)
              </label>
              <input
                type="number"
                min="1990"
                max="2099"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2023"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Taxminiy narxi ($ USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(formatMoneyInput(e.target.value))}
                  className="w-full pl-7 pr-3 py-2.5 text-sm font-semibold bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Alohida belgilari / Izoh (ixtiyoriy)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Gaz o'rnatilgan, oq rang"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-4 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading || !canAddCar}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm disabled:opacity-50"
            >
              <PlusCircle className="w-4 h-4" />
              {loading ? "Qo'shilmoqda..." : "Qo'shish"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
