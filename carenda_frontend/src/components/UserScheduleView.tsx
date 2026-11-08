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
import { User, UserScheduleContract } from "@/types/fleet";
import { getUserSchedule } from "@/lib/api";
import { formatUSD, formatDate } from "@/lib/utils";
import { resolveUserIdentity } from "@/lib/identity";

interface UserScheduleViewProps {
  user: User | null;
  onRefreshUser: () => void;
}

export function UserScheduleView({ user, onRefreshUser }: UserScheduleViewProps) {
  const [contracts, setContracts] = useState<UserScheduleContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSchedule = async () => {
    try {
      setRefreshing(true);
      const data = await getUserSchedule();
      setContracts(data);
      if (data.length > 0 && !selectedContractId) {
        setSelectedContractId(data[0].id);
      }
    } catch (err) {
      console.error("To'lov jadvalini yuklashda xatolik:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  const handleManualRefresh = () => {
    fetchSchedule();
    onRefreshUser();
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
        <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-medium">To&apos;lovlar jadvali yuklanmoqda...</p>
      </div>
    );
  }

  const activeContract =
    contracts.find((c) => c.id === selectedContractId) || contracts[0] || null;
  const identity = resolveUserIdentity(user);

  return (
    <div className="space-y-4">
      {/* Header Profile Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <UserIcon className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            {/* Line 1 (Primary): Profile Name + Role Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                {identity.fullName}
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 rounded-md">
                Ijarachi
              </span>
            </div>

            {/* Line 2 (Directly below name, above ID): Telegram Username formatted as @username */}
            <div>
              {identity.username ? (
                <a
                  href={`https://t.me/${identity.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded-lg border border-sky-200/80 transition"
                  title="Telegram profili"
                >
                  <span>@{identity.username}</span>
                </a>
              ) : (
                <span className="text-xs font-medium text-slate-500">
                  {identity.fullName}
                </span>
              )}
            </div>

            {/* Line 3 (Directly underneath username): Subtle monospace ID badge + Phone */}
            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 flex-wrap pt-0.5">
              {identity.telegramId && (
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">
                  ID: {identity.telegramId}
                </span>
              )}
              {identity.phone && (
                <span className="text-slate-500 font-sans font-medium">
                  📞 {identity.phone}
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-2xl border border-slate-100 transition disabled:opacity-50 shrink-0"
          title="Yangilash"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
        </button>
      </div>

      {contracts.length === 0 ? (
        <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center space-y-3">
          <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-3xl flex items-center justify-center mx-auto">
            <Car className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">
            Faol shartnoma topilmadi
          </h3>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            Sizga biriktirilgan avtomobil yoki faol ijara shartnomasi mavjud emas.
            Iltimos, arendatoringiz bilan bog&apos;laning.
          </p>
        </div>
      ) : (
        <>
          {/* Multiple Contracts Selector Tabs */}
          {contracts.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {contracts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedContractId(c.id)}
                  className={`px-3 py-2 text-xs font-semibold rounded-2xl whitespace-nowrap transition border ${
                    activeContract?.id === c.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {c.car_name} ({c.plate_number})
                </button>
              ))}
            </div>
          )}

          {/* Rented Car & Arendator Contact Hero Card */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-300">
                  Biriktirilgan avtomobil
                </span>
                <h3 className="text-lg font-extrabold text-white leading-tight mt-0.5">
                  {activeContract.car_name}
                </h3>
                <span className="inline-block mt-1 px-2.5 py-0.5 text-xs font-bold bg-white text-slate-900 rounded-lg font-mono border border-slate-300 shadow-2xs">
                  {activeContract.plate_number}
                </span>
              </div>

              {/* Arendator Contact (tel: link) */}
              <div className="text-right">
                <span className="text-[10px] text-slate-400">Arendator:</span>
                <p className="text-xs font-bold text-slate-200">
                  {activeContract.owner_name}
                </p>
                {activeContract.owner_phone && (
                  <a
                    href={`tel:${activeContract.owner_phone}`}
                    className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 transition"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Qo&apos;ng&apos;iroq</span>
                  </a>
                )}
              </div>
            </div>

            {/* Financial Overview Grid */}
            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10 text-xs">
              <div className="p-3 bg-white/5 rounded-2xl">
                <p className="text-[10px] text-slate-400">To&apos;langan summa</p>
                <p className="text-base font-bold text-emerald-400 mt-0.5">
                  {formatUSD(activeContract.paid_total_usd)}
                </p>
              </div>
              <div className="p-3 bg-white/5 rounded-2xl">
                <p className="text-[10px] text-slate-400">Qolgan qarz</p>
                <p className="text-base font-bold text-rose-300 mt-0.5">
                  {formatUSD(activeContract.remaining_total_usd)}
                </p>
              </div>
            </div>

            {/* Next Payment Alert Banner */}
            {activeContract.next_due_date && (
              <div className="flex items-center justify-between p-3.5 bg-emerald-500/15 border border-emerald-400/25 rounded-2xl text-xs">
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-emerald-200">Keyingi to&apos;lov sanasi:</p>
                    <p className="font-bold text-white text-xs">
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

          {/* Monthly Payment Schedule Table */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">To&apos;lovlar Jadvali</h3>
                <p className="text-[11px] text-slate-500">
                  Oylik to&apos;lovlar va qarz holati
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-xl">
                Jami: {activeContract.payments.length} oy
              </span>
            </div>

            <div className="space-y-2.5 pt-1">
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
                        ? "bg-rose-50/60 border-rose-200"
                        : isPartial
                        ? "bg-amber-50/60 border-amber-200"
                        : "bg-white border-slate-100 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">
                          {p.month_number}-oy
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {formatDate(p.due_date)}
                        </span>
                      </div>

                      {/* Status Badges */}
                      {isPaid ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> To&apos;langan
                        </span>
                      ) : isOverdue ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" /> {p.days_overdue} kun kechikkan
                        </span>
                      ) : isPartial ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> Qisman
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                          Kutilmoqda
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100 text-[11px]">
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

export const ClientPortalView = UserScheduleView;
