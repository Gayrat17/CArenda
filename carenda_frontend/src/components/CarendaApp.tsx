"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getBootstrap, getCachedBootstrapSync, getDrivers } from "@/lib/api";
import {
  BootstrapResponse,
  CarListItem,
  DashboardResponse,
  Driver,
  OverduePaymentItem,
  UpcomingPaymentItem,
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
  const router = useRouter();
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
          default_annual_percent: "20",
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
    comment?: string;
    is_postponed?: boolean;
  }
  const [activePaymentTarget, setActivePaymentTarget] = useState<PaymentTargetModal | null>(null);

  // Single-request bootstrap call to eliminate multiple roundtrips
  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      const boot = await getBootstrap({ forceRefresh });
      if (boot?.me) {
        setUser(boot.me);
        if (!boot.me.is_onboarded && boot.me.is_registered === false) {
          router.replace("/login");
          setLoading(false);
          return;
        }
        if (boot.me.role === "ijarachi" || boot.me.role === "user") {
          router.replace("/my-contracts");
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
      try {
        window.Telegram.WebApp.disableVerticalSwipes?.();
      } catch {
        // ignore if not supported in current client
      }
    }
    loadData();

    // Prevent multi-touch pinch-to-zoom and gesture zooming across mobile browsers
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    const handleGesture = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("gesturestart", handleGesture);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("gesturestart", handleGesture);
    };
  }, [loadData]);

  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState(0);

  const handlePaymentSuccess = useCallback(async () => {
    await loadData(true);
    setDetailRefreshTrigger((prev) => prev + 1);
  }, [loadData]);

  // Handlers for payments
  const handleOpenOverduePayment = (item: OverduePaymentItem | UpcomingPaymentItem) => {
    setActivePaymentTarget({
      id: item.id,
      month_number: item.month_number,
      due_date: item.due_date,
      expected_amount: item.expected_amount,
      paid_amount: item.paid_amount,
      remaining_amount: item.remaining_amount,
      car_name: item.car_name,
      driver_name: item.driver_name,
      comment: item.comment,
      is_postponed: item.is_postponed,
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
      comment: payment.comment,
      is_postponed: payment.is_postponed,
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
  const overdueContractIds = useMemo(
    () => new Set(dashboard?.overdue_payments?.map((p) => p.contract_id) || []),
    [dashboard?.overdue_payments]
  );

  // Unregistered or not onboarded user check
  if (user && !user.is_onboarded && user.is_registered === false) {
    router.replace("/login");
    return null;
  }

  // Client (Ijarachi) redirect to Client Portal
  if (user && (user.role === "ijarachi" || user.role === "user")) {
    router.replace("/my-contracts");
    return null;
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
    <main className="w-full max-w-md mx-auto min-h-screen bg-slate-50 text-slate-900 pb-24 px-4 pt-4 relative overflow-x-hidden">
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
          overdueContractIds={overdueContractIds}
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
        <SettingsTab
          user={user}
          onRefreshUser={(updatedUser) => {
            if (updatedUser) {
              setUser(updatedUser);
            }
            loadData(true);
          }}
        />
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
          key={activePaymentTarget.id}
          payment={activePaymentTarget}
          onClose={() => setActivePaymentTarget(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {selectedCarForDetailId && (
        <CarDetailModal
          carId={selectedCarForDetailId}
          refreshTrigger={detailRefreshTrigger}
          onClose={() => setSelectedCarForDetailId(null)}
          onRentClick={handleRentCar}
          onPaymentClick={handleOpenSchedulePayment}
          onRefreshParent={handlePaymentSuccess}
        />
      )}
    </main>
  );
}
