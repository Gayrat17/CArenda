"use client";

import React, { useState, useEffect } from "react";
import {
  Car,
  ShieldCheck,
  Sparkles,
  BarChart3,
  BellRing,
  CalendarCheck,
  Users,
  CheckCircle2,
  Lock,
  ArrowRight,
} from "lucide-react";

interface WelcomeOnboardingProps {
  onComplete: () => void;
}

interface SlideItem {
  badge: string;
  badgeColor: string;
  title: string;
  description: string;
  accentGradient: string;
  mainIcon: React.ReactNode;
  floatingIcon1: React.ReactNode;
  floatingIcon2: React.ReactNode;
}

export function WelcomeOnboarding({ onComplete }: WelcomeOnboardingProps) {
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const slides: SlideItem[] = [
    {
      badge: "XUSH KELIBSIZ",
      badgeColor: "bg-blue-100 text-blue-700 border-blue-200",
      title: "Carenda — Avto-ijara va Vikupning yangi davri",
      description:
        "Qog'oz daftarlar va murakkab Excel jadvallaridan voz keching. Barcha avtomobillar, shartnomalar va moliyaviy hisob-kitoblar endi bitta aqlli tizimda.",
      accentGradient: "from-blue-600 via-indigo-600 to-cyan-500",
      mainIcon: <Car className="w-14 h-14 text-white" />,
      floatingIcon1: <ShieldCheck className="w-5 h-5 text-blue-600" />,
      floatingIcon2: <Sparkles className="w-5 h-5 text-amber-500" />,
    },
    {
      badge: "AVTOMATLASHTIRISH",
      badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200",
      title: "Aniq hisob-kitob va Avto-eslatmalar",
      description:
        "Oylik to'lovlar grafigi, avtomatik qarzdorlik hisobi va to'lov muddati yaqinlashganda Telegram bot orqali yuboriladigan aqlli bildirishnomalar.",
      accentGradient: "from-emerald-500 via-teal-600 to-indigo-600",
      mainIcon: <BarChart3 className="w-14 h-14 text-white" />,
      floatingIcon1: <BellRing className="w-5 h-5 text-emerald-600" />,
      floatingIcon2: <CalendarCheck className="w-5 h-5 text-indigo-600" />,
    },
    {
      badge: "SHAFFOFLIK VA ISHONCH",
      badgeColor: "bg-violet-100 text-violet-700 border-violet-200",
      title: "Arendatorga qulay, Mijozga shaffof!",
      description:
        "Avtopark egalari uchun to'liq biznes nazorati, ijarachilar uchun esa o'z shartnomasi, to'lovlar tarixi va qolgan qarzini 24/7 kuzatib borish imkoniyati.",
      accentGradient: "from-violet-600 via-purple-600 to-blue-600",
      mainIcon: <Users className="w-14 h-14 text-white" />,
      floatingIcon1: <CheckCircle2 className="w-5 h-5 text-violet-600" />,
      floatingIcon2: <Lock className="w-5 h-5 text-blue-600" />,
    },
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentSlide < slides.length - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else if (isRightSwipe && currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && currentSlide < slides.length - 1) {
        setCurrentSlide((prev) => prev + 1);
      } else if (e.key === "ArrowLeft" && currentSlide > 0) {
        setCurrentSlide((prev) => prev - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, slides.length]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="h-dvh max-h-dvh overflow-hidden flex flex-col justify-between p-5 select-none bg-gradient-to-b from-blue-50/70 via-slate-50 to-slate-100 max-w-md mx-auto"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
            <Car className="w-4 h-4" />
          </div>
          <div className="flex items-baseline">
            <span className="font-black text-base tracking-tight text-blue-600">C</span>
            <span className="font-bold text-base tracking-tight text-slate-900">arenda</span>
          </div>
        </div>

        {currentSlide < slides.length - 1 ? (
          <button
            type="button"
            onClick={onComplete}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition px-3 py-1.5 rounded-full hover:bg-slate-200/60 active:scale-95 cursor-pointer"
          >
            O&apos;tkazib yuborish
          </button>
        ) : (
          <div className="w-16" aria-hidden="true" />
        )}
      </header>

      {/* Center Carousel Track */}
      <div className="w-full overflow-hidden flex-1 flex flex-col justify-center my-auto">
        <div
          className="flex transition-transform duration-300 ease-out h-full items-center"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {slides.map((s, idx) => (
            <div
              key={idx}
              className="w-full shrink-0 flex flex-col items-center justify-center px-2 py-4"
            >
              {/* Animated Floating Composition */}
              <div className="relative mb-7">
                {/* Background Glow */}
                <div
                  className={`absolute -inset-4 bg-gradient-to-tr ${s.accentGradient} opacity-20 blur-2xl rounded-full`}
                  aria-hidden="true"
                />

                {/* Central Icon Circle */}
                <div
                  className={`relative w-28 h-28 rounded-3xl bg-gradient-to-tr ${s.accentGradient} flex items-center justify-center shadow-xl shadow-blue-500/20`}
                >
                  {s.mainIcon}
                </div>

                {/* Floating Orbit 1 (Top Right) */}
                <div className="absolute -top-2 -right-2 w-10 h-10 rounded-2xl bg-white shadow-md border border-slate-100 flex items-center justify-center animate-bounce [animation-duration:3s]">
                  {s.floatingIcon1}
                </div>

                {/* Floating Orbit 2 (Bottom Left) */}
                <div className="absolute -bottom-2 -left-2 w-10 h-10 rounded-2xl bg-white shadow-md border border-slate-100 flex items-center justify-center animate-bounce [animation-duration:4s]">
                  {s.floatingIcon2}
                </div>
              </div>

              {/* Badge */}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wider uppercase border mb-3 ${s.badgeColor}`}
              >
                {s.badge}
              </span>

              {/* Title */}
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight text-center leading-snug px-3 mb-3">
                {s.title}
              </h2>

              {/* Text */}
              <p className="text-xs sm:text-sm text-slate-600 text-center leading-relaxed max-w-xs mx-auto px-2">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Footer Controls */}
      <footer className="space-y-4 pb-2">
        {/* Pagination Dots */}
        <div className="flex items-center justify-center gap-1.5" role="tablist">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={currentSlide === idx}
              aria-label={`Slayd ${idx + 1}`}
              onClick={() => setCurrentSlide(idx)}
              className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                currentSlide === idx
                  ? "w-8 bg-blue-600 shadow-xs shadow-blue-500/30"
                  : "w-2 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>

        {/* Action Button */}
        <div>
          {currentSlide < slides.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Keyingisi</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:brightness-105 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-blue-500/30 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Boshlash 🚀</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
