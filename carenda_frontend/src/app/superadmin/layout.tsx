"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Crown,
  LayoutDashboard,
  Users,
  Settings,
  User,
  LogOut,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { getBootstrap, logout } from "@/lib/api";
import { User as UserType } from "@/types/fleet";

export default function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkSuperadminAuth() {
      try {
        const boot = await getBootstrap({ forceRefresh: true });
        if (!isMounted) return;

        const user = boot?.me;
        if (!user || !user.is_onboarded) {
          router.replace("/login?logged_out=1");
          return;
        }

        const isSuper = Boolean(
          user.is_superuser ||
          user.is_superadmin ||
          user.role === "superadmin"
        );

        if (!isSuper) {
          // Oddiy arendator yoki mijoz kirmoqchi bo'lsa: darhol o'z paneliga qaytaramiz
          setAuthorized(false);
          setLoading(false);
          if (user.role === "ijarachi" || user.role === "user") {
            router.replace("/client");
          } else {
            router.replace("/");
          }
          return;
        }

        setCurrentUser(user);
        setAuthorized(true);
      } catch (err) {
        if (!isMounted) return;
        router.replace("/login?logged_out=1");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    checkSuperadminAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-slate-400">
          Superadmin ruxsatnomasi tekshirilmoqda...
        </p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold mb-1">Kirish taqiqlangan (403 Forbidden)</h2>
        <p className="text-xs text-slate-400 max-w-xs mb-6">
          Ushbu bo&apos;lim faqat vakolatli Superadmin uchun mo&apos;ljallangan. Sizning hisobingizda bu ruxsat mavjud emas.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/")}
          className="py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition cursor-pointer"
        >
          O&apos;z panelingizga qaytish
        </button>
      </div>
    );
  }

  const navItems = [
    {
      href: "/superadmin",
      label: "Dashboard",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      href: "/superadmin/lessors",
      label: "Arendatorlar",
      icon: Users,
      exact: false,
    },
    {
      href: "/superadmin/settings",
      label: "Tarif & To'lov",
      icon: Settings,
      exact: false,
    },
    {
      href: "/superadmin/profile",
      label: "Profil",
      icon: User,
      exact: false,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-xs">
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-tight text-white">
                  Carenda
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
                  Superadmin
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    isActive
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User mini status */}
          <div className="flex items-center gap-2">
            <Link
              href="/superadmin/profile"
              className="text-right hidden sm:block group cursor-pointer"
            >
              <span className="text-xs font-bold text-slate-200 group-hover:text-amber-400 transition block leading-tight capitalize">
                {currentUser?.full_name || "Superadmin"}
              </span>
              <span className="text-[10px] text-slate-500 font-mono block">
                {currentUser?.phone || ""}
              </span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 pb-24 sm:pb-8">
        {children}
      </main>

      {/* Bottom Mobile Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5">
        <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-bold transition active:scale-95 ${
                  isActive
                    ? "text-amber-400 bg-amber-500/10"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className={`w-4 h-4 mb-0.5 ${isActive ? "text-amber-400" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
