"use client";

import React, { useId } from "react";
import { formatUzbekPhone, validateUzbekPhone } from "@/lib/utils";

export interface UzbekPhoneInputProps {
  value: string;
  onChange: (formatted: string, backendClean: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onOperatorErrorChange?: (hasError: boolean) => void;
  showStatusBadge?: boolean;
}

export function UzbekPhoneInput({
  value,
  onChange,
  id,
  name,
  required = false,
  disabled = false,
  placeholder = "+998 (90) 123-45-67",
  className = "",
  showStatusBadge = true,
}: UzbekPhoneInputProps) {
  const autoId = useId();
  const inputId = id || autoId;

  // Validate current value
  const phoneInfo = validateUzbekPhone(value);
  const hasOperatorError = phoneInfo.hasOperator && !phoneInfo.isValidOperator;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;

    let prevDigits = value.replace(/\D/g, "");
    if (prevDigits.startsWith("998")) prevDigits = prevDigits.slice(3);
    else if (prevDigits.startsWith("8") && prevDigits.length === 10) prevDigits = prevDigits.slice(1);

    let newDigits = rawVal.replace(/\D/g, "");
    if (newDigits.startsWith("998")) newDigits = newDigits.slice(3);
    else if (newDigits.startsWith("8") && newDigits.length === 10) newDigits = newDigits.slice(1);

    // If user hit backspace on a formatting char (')', '-', space) and no digit was removed
    if (rawVal.length < value.length && newDigits.length === prevDigits.length && newDigits.length > 0) {
      newDigits = newDigits.slice(0, -1);
    }

    newDigits = newDigits.slice(0, 9);
    const formatted = formatUzbekPhone(newDigits.length > 0 ? `998${newDigits}` : "");
    const backendClean = newDigits.length === 9 ? `+998${newDigits}` : "";
    onChange(formatted, backendClean);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;

    // Prevent deleting "+998 " prefix
    if (e.key === "Backspace" && start <= 5 && end <= 5) {
      e.preventDefault();
    }
  };

  return (
    <div className="w-full">
      <div className="relative">
        <input
          id={inputId}
          name={name}
          type="tel"
          required={required}
          disabled={disabled}
          value={value || "+998 "}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="tel"
          className={`w-full px-3.5 py-2.5 text-sm font-mono font-semibold bg-white border rounded-xl transition focus:outline-hidden ${
            hasOperatorError
              ? "border-rose-400 text-rose-900 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              : "border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          } ${className}`}
        />

        {showStatusBadge && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none select-none">
            {hasOperatorError ? (
              <span className="text-xs text-rose-600 font-bold">❌</span>
            ) : phoneInfo.isValid ? (
              <span className="text-xs text-emerald-600 font-bold">✓</span>
            ) : null}
          </div>
        )}
      </div>

      {/* Operator error message */}
      {hasOperatorError && (
        <p className="mt-1 text-xs text-rose-600 font-semibold flex items-center gap-1 animate-in fade-in duration-150">
          <span>⚠️</span>
          <span>Noto&apos;g&apos;ri operator kodi kiritildi</span>
        </p>
      )}
    </div>
  );
}
