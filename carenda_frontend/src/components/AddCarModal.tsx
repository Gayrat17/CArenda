"use client";

import React, { useState } from "react";
import { X, Car as CarIcon, PlusCircle } from "lucide-react";
import { createCar } from "@/lib/api";

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
  const [defaultPrice, setDefaultPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !plateNumber.trim()) {
      setError("Iltimos, mashina nomi va davlat raqamini kiriting.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await createCar({
        name: name.trim(),
        plate_number: plateNumber.trim().toUpperCase(),
        default_price: defaultPrice ? parseFloat(defaultPrice) : 0,
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
              placeholder="Masalan: Chevrolet Gentra 1.5"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Davlat raqami (Plate number) *
            </label>
            <input
              type="text"
              required
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
              placeholder="Masalan: 01 A 777 AA"
              className="w-full px-3.5 py-2.5 text-sm font-mono uppercase bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Taxminiy narxi ($ USD)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={defaultPrice}
                onChange={(e) => setDefaultPrice(e.target.value)}
                placeholder="10000.00"
                className="w-full pl-8 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Shartnoma tuzishda mashina narxi avtomatik to'ldiriladi.
            </p>
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
