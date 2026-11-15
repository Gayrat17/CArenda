"use client";

import React, { useId } from "react";
import { formatPlateNumber, getUzbekPlateInfo } from "@/lib/utils";

export interface UzbekLicensePlateInputProps {
  value: string;
  onChange: (plateNumber: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function UzbekLicensePlateInput({
  value,
  onChange,
  id,
  name,
  required = false,
  disabled = false,
  placeholder = "01 A 777 AA",
  className = "",
  autoFocus = false,
}: UzbekLicensePlateInputProps) {
  const autoId = useId();
  const inputId = id || autoId;

  const plateInfo = getUzbekPlateInfo(value);
  const isRegionInvalid = plateInfo.hasRegion && !plateInfo.isRegionValid;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;

    // Handle backspace when user deletes a space
    let nextVal = rawVal;
    if (rawVal.length < value.length) {
      const prevClean = value.replace(/[^A-Z0-9]/gi, "");
      const newClean = rawVal.replace(/[^A-Z0-9]/gi, "");
      if (newClean.length === prevClean.length && newClean.length > 0) {
        nextVal = rawVal.slice(0, -1);
      }
    }

    const formatted = formatPlateNumber(nextVal);
    onChange(formatted);
  };

  return (
    <div className="w-full space-y-1.5">
      {/* Uzbek License Plate Physical Styled Box */}
      <div
        className={`relative flex items-center bg-white border-2 rounded-xl overflow-hidden transition shadow-xs focus-within:ring-2 ${
          isRegionInvalid
            ? "border-rose-400 focus-within:ring-rose-500/20 focus-within:border-rose-500"
            : plateInfo.isValid
            ? "border-emerald-500 focus-within:ring-emerald-500/20 focus-within:border-emerald-600"
            : "border-slate-800 focus-within:ring-blue-500/20 focus-within:border-blue-600"
        } ${className}`}
      >
        {/* Main Number Input */}
        <input
          id={inputId}
          name={name}
          type="text"
          required={required}
          disabled={disabled}
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 h-11 px-3.5 bg-transparent font-mono font-black uppercase text-slate-900 text-base sm:text-lg tracking-widest focus:outline-hidden placeholder:text-slate-300 placeholder:font-normal placeholder:tracking-normal placeholder:text-xs"
        />

        {/* Right UZ Section with Uzbekistan Flag */}
        <div className="flex flex-col items-center justify-center h-11 px-2.5 border-l-2 border-slate-800 bg-slate-50 select-none shrink-0 min-w-[50px]">
          {/* Uzbekistan Flag SVG */}
          <svg
            viewBox="0 0 24 16"
            className="w-5 h-3.5 rounded-[1px] border border-slate-300/80 shadow-2xs mb-0.5"
            aria-label="Uzbekistan Flag"
          >
            {/* Blue stripe */}
            <rect width="24" height="5" fill="#0099B5" />
            {/* Red thin line */}
            <rect y="5" width="24" height="0.5" fill="#CE1126" />
            {/* White stripe */}
            <rect y="5.5" width="24" height="5" fill="#FFFFFF" />
            {/* Red thin line */}
            <rect y="10.5" width="24" height="0.5" fill="#CE1126" />
            {/* Green stripe */}
            <rect y="11" width="24" height="5" fill="#1EB53A" />
          </svg>

          {/* UZ Country code */}
          <span className="text-[10px] font-black text-slate-900 tracking-tight leading-none">
            UZ
          </span>
        </div>
      </div>

      {/* Dynamic Region Badge / Error */}
      {plateInfo.hasRegion && (
        <div className="flex items-center gap-2 flex-wrap text-xs animate-in fade-in duration-150">
          {plateInfo.isRegionValid ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span>📍</span>
              <span>{plateInfo.regionName}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              <span>❌</span>
              <span>Mavjud bo&apos;lmagan hudud kodi</span>
            </span>
          )}

          {plateInfo.isValid && (
            <span className="text-[11px] font-semibold text-emerald-600">
              ✓ {plateInfo.plateType === "individual" ? "Jismoniy shaxs" : "Yuridik shaxs"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
