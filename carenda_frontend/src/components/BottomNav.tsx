"use client";

import React from "react";
import { LayoutDashboard, FileText, PlusCircle, Settings } from "lucide-react";

export type NavTab = "dashboard" | "cars" | "contract" | "settings";

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  overdueCount?: number;
}

export function BottomNav({ activeTab, onTabChange, overdueCount = 0 }: BottomNavProps) {
  const tabs = [
    {
      id: "dashboard" as NavTab,
      label: "Asosiy",
      icon: LayoutDashboard,
      badge: overdueCount > 0 ? overdueCount : undefined,
    },
    {
      id: "cars" as NavTab,
      label: "Shartnomalar",
      icon: FileText,
    },
    {
      id: "contract" as NavTab,
      label: "Qo'shish",
      icon: PlusCircle,
      highlight: true,
    },
    {
      id: "settings" as NavTab,
      label: "Sozlamalar",
      icon: Settings,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-lg">
      <div className="max-w-md mx-auto grid grid-cols-4 px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-1 rounded-2xl transition duration-150 ${
                isActive
                  ? "text-blue-600 font-semibold"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? "scale-110" : ""
                  }`}
                />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 px-1.5 py-0.2 text-[9px] font-bold bg-rose-600 text-white rounded-full">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
