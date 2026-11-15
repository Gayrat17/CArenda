"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Crown,
  Shield,
  Phone,
  LogOut,
  Sparkles,
  Loader2,
  Key,
} from "lucide-react";
import { getBootstrap, logout } from "@/lib/api";
import { User as UserType } from "@/types/fleet";
import { formatUzbekPhone } from "@/lib/utils";

export default function SuperadminProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    getBootstrap({ forceRefresh: true })
      .then((boot) => {
        if (boot?.me) {
          setUser(boot.me);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      if (typeof window !== "undefined") {
        const authKeys = [
          "access_token",
          "refresh_token",
          "token",
          "jwt",
          "user_role",
          "role",
          "renter_code",
          "invite_code",
          "user_data",
          "carenda_auth_token",
          "carenda_role",
          "carenda_user",
        ];
        authKeys.forEach((k) => {
          window.localStorage.removeItem(k);
          window.sessionStorage.removeItem(k);
        });

        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const key = window.localStorage.key(i);
          if (key && (key.startsWith("carenda_") || key.startsWith("carenda-"))) {
            window.localStorage.removeItem(key);
          }
        }
        for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
          const key = window.sessionStorage.key(i);
          if (key && (key.startsWith("carenda_") || key.startsWith("carenda-"))) {
            window.sessionStorage.removeItem(key);
          }
        }

        window.sessionStorage.setItem("carenda_logged_out", "true");

        document.cookie.split(";").forEach((cookie) => {
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;`;
          }
        });
      }

      await logout();
    } catch {
      router.replace("/login?logged_out=1");
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded-xl" />
        <div className="h-64 bg-slate-900 rounded-3xl border border-slate-800" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-xl font-black text-white">Superadmin Profili</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Tizim boshqaruvchisi akkaunt ma&apos;lumotlari va xavfsizlik
        </p>
      </div>

      {/* Main Profile Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-slate-950 flex items-center justify-center font-bold text-xl shadow-md shrink-0">
            <Crown className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-white capitalize">
                {user?.full_name || user?.username || "Super Admin"}
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                Super Admin
              </span>
            </div>
            {user?.phone && (
              <p className="text-xs text-slate-400 font-mono mt-1">
                📞 {formatUzbekPhone(user.phone, false)}
              </p>
            )}
          </div>
        </div>

        {/* Detailed Account Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-1">
            <span className="text-[10px] text-slate-500 block font-medium">Telegram ID</span>
            <span className="font-mono font-bold text-slate-200">
              {user?.telegram_id || "Belgilanmagan"}
            </span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-1">
            <span className="text-[10px] text-slate-500 block font-medium">Username</span>
            <span className="font-mono font-bold text-slate-200">
              {user?.username ? `@${user.username}` : "Belgilanmagan"}
            </span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-1">
            <span className="text-[10px] text-slate-500 block font-medium">Tizimdagi Roli</span>
            <span className="font-bold text-amber-400">
              {user?.is_superuser ? "Asosiy Superuser (Root)" : "Superadmin"}
            </span>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-1">
            <span className="text-[10px] text-slate-500 block font-medium">Xavfsizlik darajasi</span>
            <span className="font-bold text-emerald-400 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              <span>To&apos;liq boshqaruv (Full Access)</span>
            </span>
          </div>
        </div>

        {/* Security / Isolation Notice */}
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-xs leading-relaxed space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Alohida Superadmin Muhiti:</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Superadmin paneli arendatorlar va ijarachilar interfeysidan butunlay ajratilgan.
            Barcha platforma sozlamalari va arendatorlar boshqaruvi ushbu panel orqali amalga oshiriladi.
          </p>
        </div>

        {/* Log Out Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full py-3.5 px-4 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-2xl shadow-xs transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Hisobdan chiqish (Log Out)</span>
          </button>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div className="relative bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-5 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <LogOut className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="font-extrabold text-base text-white">
                Superadmin hisobidan chiqish
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Haqiqatan ham superadmin hisobidan chiqmoqchimisiz? Barcha sessiya kesh ma&apos;lumotlari tozalanadi.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loggingOut ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>{loggingOut ? "Chiqilmoqda..." : "Ha, hisobdan chiqish"}</span>
              </button>

              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
