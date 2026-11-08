"use client";

import React, { useEffect, useState } from "react";
import {
  Car,
  Phone,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  User as UserIcon,
  ShieldCheck,
  DollarSign,
} from "lucide-react";
import { ClientContract, User } from "@/types/fleet";
import { getClientContracts } from "@/lib/api";
import { formatUSD, formatDate } from "@/lib/utils";

interface ClientPortalViewProps {
  user: User | null;
  onRefreshUser: () => void;
}

export function ClientPortalView({ user, onRefreshUser }: ClientPortalViewProps) {
  const [contracts, setContracts] = useState<ClientContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchContracts = async () => {
    try {
      setRefreshing(true);
      const data = await getClientContracts();
      setContracts(data);
      if (data.length > 0 && !selectedContractId) {
        setSelectedContractId(data[0].id);
      }
    } catch (err) {
      console.error("Mijoz shartnomalarini yuklashda xatolik:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);

  const activeContract =
    contracts.find((c) => c.id === selectedContractId) || contracts[0] || null;

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Mijoz Kabineti
            </span>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">
              {user?.full_name || "Hurmatli Mijoz"}
            </h1>
            {user?.phone && (
              <p className="text-xs text-slate-500 font-mono mt-0.5">{user.phone}</p>
            )}
          </div>
          <button
            onClick={() => {
              fetchContracts();
              onRefreshUser();
            }}
            disabled={refreshing}
            className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 transition active:scale-95 disabled:opacity-50"
            title="Yangilash"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Arendator / Company Info */}
        {activeContract && (
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Arendator</p>
              <p className="text-xs font-bold text-slate-800">{activeContract.owner_name}</p>
            </div>
            {activeContract.owner_phone && (
              <a
                href={`tel:${activeContract.owner_phone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-blue-600 shadow-2xs hover:bg-blue-50 transition"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Qo&apos;ng&apos;iroq</span>
              </a>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs">Ma&apos;lumotlar yuklanmoqda...</p>
        </div>
      ) : contracts.length === 0 ? (
        /* Empty State */
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xs text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <Car className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-base">Hozircha faol shartnoma yo&apos;q</h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            Arendatoringiz sizga avtomobil biriktirib, shartnoma tuzganida to&apos;lovlar jadvali ushbu sahifada avtomatik paydo bo&apos;ladi.
          </p>
        </div>
      ) : (
        <>
          {/* Multiple contracts tabs if applicable */}
          {contracts.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {contracts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedContractId(c.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                    activeContract.id === c.id
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  {c.car_name} ({c.plate_number})
                </button>
              ))}
            </div>
          )}

          {/* Active Car & Status Card */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white p-5 rounded-3xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-white/10 rounded-2xl text-emerald-400">
                  <Car className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-300">Ijara avtomobili</p>
                  <h2 className="text-lg font-bold leading-tight">{activeContract.car_name}</h2>
                </div>
              </div>
              <span className="px-2.5 py-1 text-xs font-bold bg-white text-slate-900 rounded-lg font-mono border border-slate-300">
                {activeContract.plate_number}
              </span>
            </div>

            {/* Financial Overview Grid */}
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10 text-xs">
              <div className="p-2.5 bg-white/5 rounded-2xl">
                <p className="text-[10px] text-slate-400">To&apos;langan summa</p>
                <p className="text-base font-bold text-emerald-400 mt-0.5">
                  {formatUSD(activeContract.paid_total_usd)}
                </p>
              </div>
              <div className="p-2.5 bg-white/5 rounded-2xl">
                <p className="text-[10px] text-slate-400">Qolgan qarz</p>
                <p className="text-base font-bold text-rose-300 mt-0.5">
                  {formatUSD(activeContract.remaining_total_usd)}
                </p>
              </div>
            </div>

            {/* Next Payment Alert Banner */}
            {activeContract.next_due_date && (
              <div className="flex items-center justify-between p-3 bg-emerald-500/15 border border-emerald-400/20 rounded-2xl text-xs">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-[10px] text-emerald-200">Keyingi to&apos;lov sanasi:</p>
                    <p className="font-bold text-white">
                      {formatDate(activeContract.next_due_date)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-emerald-200">Kutilayotgan summa:</p>
                  <p className="font-bold text-emerald-300 text-sm">
                    {formatUSD(activeContract.next_due_amount || activeContract.monthly_amount)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Monthly Payment Schedule List */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">To&apos;lovlar Jadvali</h3>
                <p className="text-[11px] text-slate-500">
                  Oylik to&apos;lovlar va qarz holati
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg">
                Jami: {activeContract.payments.length} oy
              </span>
            </div>

            <div className="space-y-2 pt-1">
              {activeContract.payments.map((p) => {
                const isPaid = p.status === "paid";
                const isPartial = p.status === "partial";
                const isOverdue = !isPaid && p.days_overdue > 0;

                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-2xl border transition ${
                      isPaid
                        ? "bg-slate-50/60 border-slate-100 text-slate-500"
                        : isOverdue
                        ? "bg-rose-50/50 border-rose-200"
                        : isPartial
                        ? "bg-amber-50/50 border-amber-200"
                        : "bg-white border-slate-100 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          {p.month_number}-oy
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {formatDate(p.due_date)}
                        </span>
                      </div>

                      {/* Status Badges */}
                      {isPaid ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> To&apos;langan
                        </span>
                      ) : isOverdue ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" /> {p.days_overdue} kun kechikkan
                        </span>
                      ) : isPartial ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> Qisman to&apos;langan
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Kutilmoqda
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-100 text-[11px]">
                      <div>
                        <p className="text-[10px] text-slate-400">Kutilgan:</p>
                        <p className="font-semibold text-slate-700">{formatUSD(p.expected_amount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">To&apos;langan:</p>
                        <p className="font-semibold text-emerald-600">{formatUSD(p.paid_amount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400">Qolgan:</p>
                        <p className="font-bold text-rose-600">{formatUSD(p.remaining_amount)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
