"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getCars, getDashboard, getDrivers, getMe } from "@/lib/api";
import {
  CarListItem,
  DashboardResponse,
  Driver,
  OverduePaymentItem,
  Payment,
  User,
} from "@/types/fleet";
import { BottomNav, NavTab } from "@/components/BottomNav";
import { DashboardTab } from "@/components/DashboardTab";
import { CarsTab } from "@/components/CarsTab";
import { ContractTab } from "@/components/ContractTab";
import { SettingsTab } from "@/components/SettingsTab";
import { PaymentModal } from "@/components/PaymentModal";
import { AddCarModal } from "@/components/AddCarModal";
import { CarDetailModal } from "@/components/CarDetailModal";

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTab>("dashboard");

  // Core Data State
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [cars, setCars] = useState<CarListItem[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & Navigation Selection State
  const [selectedCarForDetailId, setSelectedCarForDetailId] = useState<number | null>(null);
  const [selectedCarForRent, setSelectedCarForRent] = useState<CarListItem | null>(null);
  const [addCarModalOpen, setAddCarModalOpen] = useState(false);

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

  // Initialize Telegram WebApp and fetch core state
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [meData, dashData, carsData, driversData] = await Promise.all([
        getMe().catch(() => null),
        getDashboard().catch(() => null),
        getCars().catch(() => []),
        getDrivers().catch(() => []),
      ]);

      if (meData) setUser(meData);
      if (dashData) setDashboard(dashData);
      setCars(carsData);
      setDrivers(driversData);
    } catch (err) {
      console.error("Failed to load platform data:", err);
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
          canAddCar={user?.can_add_car ?? true}
          onAddCarClick={() => setAddCarModalOpen(true)}
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

      {addCarModalOpen && (
        <AddCarModal
          canAddCar={user?.can_add_car ?? true}
          carsCount={user?.cars_count || 0}
          carsLimit={user?.cars_limit || 2}
          onClose={() => setAddCarModalOpen(false)}
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
