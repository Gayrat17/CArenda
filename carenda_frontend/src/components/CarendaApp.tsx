"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getBootstrap, getCachedBootstrapSync, getDrivers } from "@/lib/api";
import {
  BootstrapResponse,
  CarListItem,
  DashboardResponse,
  Driver,
  OverduePaymentItem,
  Payment,
  User,
  UserScheduleContract,
} from "@/types/fleet";
import { BottomNav, NavTab } from "@/components/BottomNav";
import { DashboardTab } from "@/components/DashboardTab";
import { CarsTab } from "@/components/CarsTab";
import { ContractTab } from "@/components/ContractTab";
import { SettingsTab } from "@/components/SettingsTab";
import { PaymentModal } from "@/components/PaymentModal";
import { CarDetailModal } from "@/components/CarDetailModal";
import { UserScheduleView } from "@/components/UserScheduleView";
import { Phone } from "lucide-react";

export function CarendaApp() {
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");

  // Immediate synchronous cache hydration from memory / localStorage
  const [cachedBoot] = useState<BootstrapResponse | null>(() => getCachedBootstrapSync());

  // Extract Telegram user info if available on first cold render
  const getInitialUser = (): User | null => {
    if (cachedBoot?.me) return cachedBoot.me;
    if (typeof window !== "undefined") {
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
      if (tgUser) {
        const tgId = tgUser.id ?? 0;
        const fullName =
          [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
          tgUser.username ||
          "Foydalanuvchi";
        return {
          id: tgId,
          telegram_id: tgId || null,
          username: tgUser.username || null,
          full_name: fullName,
          phone: "",
          role: "arendator",
          plan: "trial",
          cars_limit: 2,
          cars_count: 0,
          expires_at: "",
          is_subscription_active: true,
          can_add_car: true,
          default_annual_percent: "20.00",
          is_registered: true,
        };
      }
    }
    return null;
  };

  const [user, setUser] = useState<User | null>(getInitialUser);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(
    () => cachedBoot?.dashboard || null
  );
  const [cars, setCars] = useState<CarListItem[]>(() => cachedBoot?.cars || []);
  const [userSchedule, setUserSchedule] = useState<UserScheduleContract[] | null>(
    () => cachedBoot?.user_schedule || null
  );
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !cachedBoot);

  // Modals & Navigation Selection State
  const [selectedCarForDetailId, setSelectedCarForDetailId] = useState<number | null>(null);
  const [selectedCarForRent, setSelectedCarForRent] = useState<CarListItem | null>(null);

  interface PaymentTargetModal {
    id: number;
    month_number?: number;
    due_date: string;
    expected_amount: string;
    paid_amount: string;
    remaining_amount: string;
    car_name?: string;
    driver_name?: string;
  }
  const [activePaymentTarget, setActivePaymentTarget] = useState<PaymentTargetModal | null>(null);

  // Single-request bootstrap call to eliminate multiple roundtrips
  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      const boot = await getBootstrap({ forceRefresh });
      if (boot?.me) {
        setUser(boot.me);
        if (boot.me.role === "user") {
          setUserSchedule(boot.user_schedule || []);
          setLoading(false);
          return;
        }
        if (boot.me.is_registered === false) {
          setLoading(false);
          return;
        }
      }

      if (boot?.dashboard) setDashboard(boot.dashboard);
      if (boot?.cars) setCars(boot.cars);
      if (boot?.user_schedule) setUserSchedule(boot.user_schedule);

      // Lazily fetch drivers for ContractTab in background without blocking
      getDrivers({ forceRefresh }).then(setDrivers).catch(() => {});
    } catch (err) {
      console.error("Failed to load platform data via bootstrap:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Notify Telegram Mini App environment
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready?.();
      window.Telegram.WebApp.expand?.();
    }
    loadData();
  }, [loadData]);

  // Handlers for payments
  const handleOpenOverduePayment = (item: OverduePaymentItem) => {
    setActivePaymentTarget({
      id: item.id,
      due_date: item.due_date,
      expected_amount: item.expected_amount,
      paid_amount: item.paid_amount,
      remaining_amount: item.remaining_amount,
      car_name: item.car_name,
      driver_name: item.driver_name,
    });
  };

  const handleOpenSchedulePayment = (
    payment: Payment,
    carName: string,
    driverName: string
  ) => {
    setActivePaymentTarget({
      id: payment.id,
      month_number: payment.month_number,
      due_date: payment.due_date,
      expected_amount: payment.expected_amount,
      paid_amount: payment.paid_amount,
      remaining_amount: payment.remaining_amount,
      car_name: carName,
      driver_name: driverName,
    });
  };

  // Rent car action from CarDetailModal
  const handleRentCar = (carDetail: { id: number; default_price: string }) => {
    const matched = cars.find((c) => c.id === carDetail.id);
    if (matched) {
      setSelectedCarForRent(matched);
      setActiveTab("contract");
    }
  };

  // Contract created successfully
  const handleContractCreated = (carId: number) => {
    loadData();
    setSelectedCarForDetailId(carId);
    setActiveTab("cars");
  };

  const overdueCount = dashboard?.overdue_payments?.length || 0;

  // Unregistered user check (phone verification required in Telegram Bot)
  if (user && user.is_registered === false) {
    return (
      <main className="max-w-md mx-auto min-h-screen bg-slate-50 text-slate-900 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mb-4 shadow-xs">
          <Phone className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Ro&apos;yxatdan o&apos;tish tugallanmagan
        </h2>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Iltimos, Carenda tizimidan foydalanish uchun Telegram botimizda telefon raqamingizni yuboring va ro&apos;yxatdan o&apos;tishni yakunlang.
        </p>
        <button
          onClick={() => {
            if (typeof window !== "undefined" && window.Telegram?.WebApp) {
              window.Telegram.WebApp.close?.();
            }
          }}
          className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition active:scale-98 cursor-pointer"
        >
          Telegram Botga qaytish
        </button>
      </main>
    );
  }

  // If user is a Driver / Ijarachi, show the dedicated read-only schedule view
  if (user?.role === "user") {
    return (
      <main className="max-w-md mx-auto min-h-screen bg-slate-50 text-slate-900 pb-8 px-4 pt-4 relative">
        <UserScheduleView
          user={user}
          initialContracts={userSchedule}
          onRefreshUser={loadData}
        />
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto min-h-screen bg-slate-50 text-slate-900 pb-24 px-4 pt-4 relative">
      {/* Active Tab View */}
      {activeTab === "dashboard" && (
        <DashboardTab
          user={user}
          dashboard={dashboard}
          loading={loading}
          onPaymentClick={handleOpenOverduePayment}
          onRefresh={loadData}
          onNavigateTab={setActiveTab}
        />
      )}

      {activeTab === "cars" && (
        <CarsTab
          cars={cars}
          loading={loading}
          onNavigateTab={setActiveTab}
          onSelectCar={(id) => setSelectedCarForDetailId(id)}
        />
      )}

      {activeTab === "contract" && (
        <ContractTab
          user={user}
          cars={cars}
          drivers={drivers}
          selectedCarForRent={selectedCarForRent}
          onSuccess={handleContractCreated}
          onNavigateCars={() => setActiveTab("cars")}
        />
      )}

      {activeTab === "settings" && (
        <SettingsTab user={user} onRefreshUser={loadData} />
      )}

      {/* Sticky Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab !== "contract") {
            setSelectedCarForRent(null);
          }
          setActiveTab(tab);
        }}
        overdueCount={overdueCount}
      />

      {/* Modals */}
      {activePaymentTarget && (
        <PaymentModal
          payment={activePaymentTarget}
          onClose={() => setActivePaymentTarget(null)}
          onSuccess={loadData}
        />
      )}

      {selectedCarForDetailId && (
        <CarDetailModal
          carId={selectedCarForDetailId}
          onClose={() => setSelectedCarForDetailId(null)}
          onRentClick={handleRentCar}
          onPaymentClick={handleOpenSchedulePayment}
          onRefreshParent={loadData}
        />
      )}
    </main>
  );
}
