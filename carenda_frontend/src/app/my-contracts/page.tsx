"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Car, AlertCircle, RefreshCw, LogOut } from "lucide-react";
import { getBootstrap, getUserSchedule } from "@/lib/api";
import { User, UserScheduleContract } from "@/types/fleet";
import { UserScheduleView } from "@/components/UserScheduleView";

export default function MyContractsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [contracts, setContracts] = useState<UserScheduleContract[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      const boot = await getBootstrap({ forceRefresh });
      if (boot?.me) {
        if (!boot.me.is_onboarded && boot.me.is_registered === false) {
          router.replace("/login");
          return;
        }

        // If Arendator, redirect to lessor dashboard
        if (boot.me.role === "arendator" || boot.me.role === "owner") {
          router.replace("/");
          return;
        }

        setUser(boot.me);
      }

      const scheduleData = await getUserSchedule({ forceRefresh });
      setContracts(scheduleData || []);
    } catch (err: unknown) {
      console.error("Failed to load client contracts:", err);
      const msg = err instanceof Error ? err.message : "Ma'lumotlarni yuklashda xatolik yuz berdi.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready?.();
      window.Telegram.WebApp.expand?.();
    }
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-500">
          Shartnomalar va to&apos;lovlar yuklanmoqda...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 pt-3 px-3 sm:px-4 max-w-md mx-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Car className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-slate-900 leading-tight">Carenda</h1>
            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider block">
              Mijoz Portali
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl shadow-2xs transition active:scale-95 cursor-pointer"
          title="Yangilash"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2.5 mb-4 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* Main Schedule and Contracts */}
      <UserScheduleView
        user={user}
        initialContracts={contracts}
        onRefreshUser={() => loadData(true)}
      />
    </div>
  );
}
