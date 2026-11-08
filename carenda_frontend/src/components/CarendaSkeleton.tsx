"use client";

import React from "react";

export function CarendaSkeleton() {
  return (
    <main className="max-w-md mx-auto min-h-screen bg-slate-50 text-slate-900 pb-24 px-4 pt-4 relative animate-pulse">
      {/* Top Header Card Skeleton */}
      <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2">
            <div className="w-24 h-3 bg-blue-100 rounded-full" />
            <div className="flex items-center gap-2">
              <div className="w-36 h-6 bg-slate-200 rounded-lg" />
              <div className="w-16 h-5 bg-blue-100 rounded-md" />
            </div>
            <div className="w-28 h-3.5 bg-slate-100 rounded" />
          </div>
          <div className="w-10 h-10 rounded-2xl bg-slate-100" />
        </div>

        {/* Quick summary strip */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <div className="h-12 bg-slate-50 rounded-xl" />
          <div className="h-12 bg-slate-50 rounded-xl" />
        </div>
      </div>

      {/* Metrics Grid Skeleton */}
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-100" />
            <div className="w-20 h-3 bg-slate-100 rounded" />
            <div className="w-12 h-6 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Overdue / Alert Card Skeleton */}
      <div className="mt-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-2.5">
        <div className="flex justify-between items-center">
          <div className="w-28 h-4 bg-slate-200 rounded" />
          <div className="w-12 h-4 bg-slate-100 rounded" />
        </div>
        <div className="h-16 bg-slate-50 rounded-xl" />
      </div>

      {/* Sticky Bottom Navigation Bar Skeleton */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 py-2">
        <div className="max-w-md mx-auto flex items-center justify-around">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1 py-1">
              <div className="w-5 h-5 bg-slate-200 rounded-md" />
              <div className="w-8 h-2 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </nav>
    </main>
  );
}
