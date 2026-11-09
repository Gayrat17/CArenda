"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  User,
  Shield,
  Key,
  Phone,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Check,
} from "lucide-react";
import { completeOnboarding, getBootstrap, getMe, verifyInviteCode } from "@/lib/api";
import { formatUzbekPhone } from "@/lib/utils";
import { VerifyInviteCodeResponse } from "@/types/fleet";

export default function LoginPage() {
  const router = useRouter();

  // Onboarding Wizard Steps: 1: Role, 2: Special Code (Ijarachi only), 3: Phone & Identity
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRole, setSelectedRole] = useState<"arendator" | "ijarachi" | null>(null);

  // Invite code state for Ijarachi
  const [inviteCode, setInviteCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<VerifyInviteCodeResponse | null>(null);

  // Phone and Profile state
  const [phoneNumber, setPhoneNumber] = useState("+998 ");
  const [fullName, setFullName] = useState("");
  const [requestingContact, setRequestingContact] = useState(false);
  const [hasTelegramContact, setHasTelegramContact] = useState(false);

  // Submitting state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Check if user is already onboarded on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const tg = (window as unknown as { Telegram?: { WebApp?: Record<string, unknown> } }).Telegram?.WebApp;
      if (tg) {
        if (typeof tg.ready === "function") tg.ready();
        if (typeof tg.expand === "function") tg.expand();
        if (typeof tg.requestContact === "function") {
          setHasTelegramContact(true);
        }

        const initDataUnsafe = tg.initDataUnsafe as { user?: { first_name?: string; last_name?: string; username?: string } } | undefined;
        const tgUser = initDataUnsafe?.user;
        if (tgUser) {
          const tgFullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
          if (tgFullName) {
            setFullName(tgFullName);
          } else if (tgUser.username) {
            setFullName(tgUser.username);
          }
        }
      }
    }

    getBootstrap({ forceRefresh: true })
      .then((boot) => {
        if (boot?.me?.is_onboarded) {
          if (boot.me.role === "ijarachi" || boot.me.role === "user") {
            router.replace("/client");
          } else {
            router.replace("/");
          }
        }
      })
      .catch(() => {});
  }, [router]);

  // Handle Verify Code
  const handleVerifyCode = async () => {
    const cleanCode = inviteCode.trim().toUpperCase();
    if (!cleanCode) {
      setCodeError("Iltimos, arendatoringiz bergan maxsus kodni kiriting.");
      return;
    }

    setVerifyingCode(true);
    setCodeError(null);
    try {
      const res = await verifyInviteCode(cleanCode);
      if (res && res.valid) {
        setVerificationData(res);
        setCodeError(null);
      } else {
        setVerificationData(null);
        setCodeError("Kiritilgan maxsus kod xato! Iltimos, arendatoringizdan to'g'ri kodni so'rang.");
      }
    } catch (err: unknown) {
      setVerificationData(null);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("maxsus kod xato") || msg.includes("400")) {
        setCodeError("Kiritilgan maxsus kod xato! Iltimos, arendatoringizdan to'g'ri kodni so'rang.");
      } else {
        setCodeError("Kiritilgan maxsus kod xato! Iltimos, arendatoringizdan to'g'ri kodni so'rang.");
      }
    } finally {
      setVerifyingCode(false);
    }
  };

  // Submit helper that completes onboarding and redirects cleanly
  const submitOnboardingWithPhone = async (phoneToSubmit: string) => {
    if (!selectedRole) {
      setSubmitError("Iltimos, avval rolingizni tanlang.");
      return;
    }

    const cleanPhone = phoneToSubmit.replace(/[^\d+]/g, "").trim();
    if (cleanPhone.replace(/\D/g, "").length < 9) {
      setSubmitError("Iltimos, to'liq telefon raqamingizni kiriting (+998 XX XXX XX XX).");
      return;
    }

    if (selectedRole === "ijarachi" && !inviteCode.trim()) {
      setSubmitError("Ijarachi uchun maxsus kod kiritilishi majburiy.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await completeOnboarding({
        role: selectedRole,
        phone_number: phoneToSubmit,
        invite_code: selectedRole === "ijarachi" ? inviteCode.trim().toUpperCase() : undefined,
        full_name: fullName.trim() || undefined,
      });

      if (typeof window !== "undefined" && window.Telegram?.WebApp) {
        try {
          window.Telegram.WebApp.HapticFeedback?.notificationOccurred?.("success");
        } catch {
          // ignore
        }
      }

      if (res.role === "ijarachi" || res.role === "user") {
        router.replace("/client");
      } else {
        router.replace("/");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ro'yxatdan o'tishda xatolik yuz berdi.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Request Contact via Telegram WebApp
  const handleRequestTelegramContact = () => {
    if (typeof window !== "undefined") {
      const tg = (window as unknown as { Telegram?: { WebApp?: { requestContact?: (cb: (sent: boolean) => void) => void } } }).Telegram?.WebApp;
      if (typeof tg?.requestContact === "function") {
        setRequestingContact(true);
        setSubmitError(null);
        tg.requestContact(async (sent: boolean) => {
          if (!sent) {
            setRequestingContact(false);
            setSubmitError("Telefon raqamini yuborish rad etildi. Iltimos, raqamingizni quyidagi maydonga kiriting.");
            return;
          }

          // Contact shared to Telegram bot! Poll for updated phone in backend
          let retrievedPhone = "";
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise((r) => setTimeout(r, attempt === 0 ? 500 : 1000));
            try {
              const me = await getMe({ forceRefresh: true });
              if (me?.phone || me?.phone_number) {
                retrievedPhone = (me.phone || me.phone_number || "").trim();
                break;
              }
            } catch {
              // ignore
            }
          }

          setRequestingContact(false);

          if (retrievedPhone) {
            setPhoneNumber(formatUzbekPhone(retrievedPhone, false));
            await submitOnboardingWithPhone(retrievedPhone);
          } else {
            setSubmitError("Telefon raqamingiz bot orqali qabul qilindi. Iltimos, pastdagi 'Ro'yxatdan o'tishni yakunlash' tugmasini bosing.");
          }
        });
      }
    }
  };

  // Final Submit from Form
  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitOnboardingWithPhone(phoneNumber);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50/70 via-slate-50 to-slate-100 flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto">
      {/* Brand Header */}
      <div className="pt-6 pb-4 text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20 mb-1">
          <Car className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Carenda</h1>
        <p className="text-xs text-slate-500 font-medium">
          Avtomobillarni arendaga berish va boshqarish platformasi
        </p>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 pt-3">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step >= 1 ? "w-8 bg-blue-600" : "w-2 bg-slate-200"
            }`}
          />
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step >= 2 ? "w-8 bg-blue-600" : "w-2 bg-slate-200"
            }`}
          />
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              step >= 3 ? "w-8 bg-blue-600" : "w-2 bg-slate-200"
            }`}
          />
        </div>
      </div>

      {/* Main Wizard Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm flex-1 flex flex-col justify-between my-2">
        {/* STEP 1: Select Role */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                1-QADAM / 3
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Rolingizni tanlang
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Platformadan qaysi maqsadda foydalanmoqchisiz?
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {/* Option A: Arendator */}
              <button
                type="button"
                onClick={() => setSelectedRole("arendator")}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  selectedRole === "arendator"
                    ? "border-blue-600 bg-blue-50/60 shadow-xs"
                    : "border-slate-100 bg-slate-50/70 hover:border-slate-200"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    selectedRole === "arendator"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-700 shadow-2xs"
                  }`}
                >
                  <Shield className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-900">
                      Men Arendatorman
                    </h3>
                    {selectedRole === "arendator" && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Avtomobil egasi. Avtoparkingizni boshqaring, shartnomalar tuzing va to&apos;lovlarni qabul qiling.
                  </p>
                </div>
              </button>

              {/* Option B: Ijarachi */}
              <button
                type="button"
                onClick={() => setSelectedRole("ijarachi")}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-3.5 ${
                  selectedRole === "ijarachi"
                    ? "border-blue-600 bg-blue-50/60 shadow-xs"
                    : "border-slate-100 bg-slate-50/70 hover:border-slate-200"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    selectedRole === "ijarachi"
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-700 shadow-2xs"
                  }`}
                >
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-900">
                      Men Ijarachiman (Mijoz)
                    </h3>
                    {selectedRole === "ijarachi" && (
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Haydovchi / Mijoz. Arendatoringiz bergan maxsus kod orqali to&apos;lov jadvalingizni kuzatib boring.
                  </p>
                </div>
              </button>
            </div>

            <div className="pt-6">
              <button
                type="button"
                disabled={!selectedRole}
                onClick={() => {
                  if (selectedRole === "ijarachi") {
                    setStep(2);
                  } else {
                    setStep(3);
                  }
                }}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition active:scale-98 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>Davom etish</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Special Invite Code (Ijarachi Only) */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 font-medium mb-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Orqaga</span>
              </button>
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
                2-QADAM / 3
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Maxsus kodni kiriting
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Arendatoringiz (mashina egasi) sizga bergan 6 belgili maxsus kodni kiriting (masalan: <code className="bg-slate-100 text-blue-700 px-1 py-0.5 rounded font-mono font-bold">CR4829</code> yoki <code className="bg-slate-100 text-blue-700 px-1 py-0.5 rounded font-mono font-bold">AR-XXXX</code>).
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Maxsus Kod
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => {
                        setInviteCode(e.target.value.toUpperCase());
                        setCodeError(null);
                        setVerificationData(null);
                      }}
                      placeholder="CR4829"
                      maxLength={12}
                      className="w-full pl-10 pr-3 py-3 font-mono font-bold text-sm tracking-wider uppercase bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={verifyingCode || !inviteCode.trim()}
                    className="py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {verifyingCode ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Tekshirish"
                    )}
                  </button>
                </div>
              </div>

              {/* Error banner if invalid */}
              {codeError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">{codeError}</p>
                </div>
              )}

              {/* Success card if valid */}
              {verificationData && verificationData.valid && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Kod tasdiqlandi!</span>
                  </div>
                  <div className="text-xs text-slate-700 space-y-1 pt-1">
                    <p>
                      🏢 <span className="font-semibold">Arendator:</span>{" "}
                      {verificationData.arendator_name}
                    </p>
                    {verificationData.car_name && (
                      <p>
                        🚗 <span className="font-semibold">Avtomobil:</span>{" "}
                        {verificationData.car_name}{" "}
                        {verificationData.plate_number && (
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-[10px] font-bold">
                            {verificationData.plate_number}
                          </span>
                        )}
                      </p>
                    )}
                    {verificationData.monthly_amount && (
                      <p>
                        💵 <span className="font-semibold">Oylik to&apos;lov:</span>{" "}
                        ${verificationData.monthly_amount}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6">
              <button
                type="button"
                disabled={!verificationData || !verificationData.valid}
                onClick={() => setStep(3)}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition active:scale-98 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>Davom etish</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Phone Verification & Identity */}
        {step === 3 && (
          <form onSubmit={handleCompleteOnboarding} className="space-y-4 animate-in fade-in duration-200">
            <div>
              <button
                type="button"
                onClick={() => {
                  if (selectedRole === "ijarachi") {
                    setStep(2);
                  } else {
                    setStep(1);
                  }
                }}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 font-medium mb-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Orqaga</span>
              </button>
              <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
                3-QADAM / 3
              </span>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                Telefon raqamingizni tasdiqlang
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Hisobingiz xavfsizligi va to&apos;lov eslatmalarini qabul qilish uchun telefon raqam talab etiladi.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {/* Optional Telegram Contact Button */}
              {hasTelegramContact && (
                <>
                  <button
                    type="button"
                    onClick={handleRequestTelegramContact}
                    disabled={requestingContact || submitting}
                    className="w-full py-3.5 px-4 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
                  >
                    {requestingContact ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span>Raqam qabul qilinmoqda...</span>
                      </>
                    ) : (
                      <>
                        <Phone className="w-3.5 h-3.5 text-blue-600" />
                        <span>📱 Telegram orqali raqamni ulashish</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2 py-0.5">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      yoki qo&apos;lda kiriting
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                </>
              )}

              {/* Phone Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Telefon raqam <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(formatUzbekPhone(e.target.value, false))}
                    placeholder="+998 90 123 45 67"
                    className="w-full pl-10 pr-3 py-3 font-mono font-bold text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Full Name Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Ism va Familiya <span className="text-slate-400 font-normal">(ixtiyoriy)</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alisher Navoiy"
                    className="w-full pl-10 pr-3 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {submitError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">{submitError}</p>
                </div>
              )}
            </div>

            <div className="pt-6">
              <button
                type="submit"
                disabled={submitting || phoneNumber.replace(/\D/g, "").length < 9}
                className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition active:scale-98 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saqlanmoqda...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-blue-200" />
                    <span>Ro&apos;yxatdan o&apos;tishni yakunlash</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-center py-2 text-[11px] text-slate-400 font-medium">
        Carenda v2.0 • Barcha huquqlar himoyalangan
      </div>
    </div>
  );
}
