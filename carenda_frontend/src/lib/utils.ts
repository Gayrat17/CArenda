export function formatUSD(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "$0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format percent as an integer string without decimals (e.g. 20 instead of 20.00).
 * Percent values in Carenda are always whole numbers.
 */
export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  if (isNaN(num)) return "0";
  return Math.round(num).toString();
}

/**
 * Formats a currency/amount input with thousands spaces (e.g. "10000" -> "10 000").
 * Preserves cents/decimals up to 2 decimal places if user enters them.
 */
export function formatMoneyInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  if (!str) return "";

  // Strip all non-numeric characters except single decimal point
  const cleaned = str.replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  const parts = cleaned.split(".");
  // Strip leading zeros unless it's just "0"
  const integerPart = parts[0].replace(/^0+(?=\d)/, "");
  const formattedInt = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  if (parts.length > 1) {
    const decimalPart = parts.slice(1).join("").slice(0, 2);
    return `${formattedInt || "0"}.${decimalPart}`;
  }

  return formattedInt;
}

/**
 * Parses a formatted money input string back into a plain floating-point number.
 */
export function parseMoneyValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const clean = String(value).replace(/[^\d.]/g, "");
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  А: "A", В: "B", С: "C", Е: "E", Н: "H", К: "K",
  М: "M", О: "O", Р: "P", Т: "T", Х: "X", У: "Y"
};

/**
 * Formats car license plate in Uzbekistan standard formats:
 * - Individual: 01 A 777 AA (2 digits, 1 letter, 3 digits, 2 letters)
 * - Legal entity: 01 777 AAA (2 digits, 3 digits, 3 letters)
 * - Trailer / other: 01 1234 AA (2 digits, 4 digits, 2 letters)
 * Auto-converts Cyrillic keyboard characters to Latin and strictly enforces valid sequence.
 */
export function formatPlateNumber(value: string): string {
  if (!value) return "";
  let clean = value.toUpperCase();
  for (const [cyr, lat] of Object.entries(CYRILLIC_TO_LATIN_MAP)) {
    clean = clean.split(cyr).join(lat);
  }
  const raw = clean.replace(/[^A-Z0-9]/g, "");
  if (!raw) return "";

  // Plate must start with region code digits (01-99)
  const startDigits = raw.replace(/^[^0-9]+/, "");
  if (!startDigits) return "";

  const region = startDigits.slice(0, 2);
  if (startDigits.length <= 2) return region;

  const rest = startDigits.slice(2);
  // Case A: 3rd character is a Latin letter (Individual: 01 A 777 AA)
  if (/^[A-Z]/.test(rest)) {
    const letter1 = rest[0];
    const afterLetter1 = rest.slice(1);
    const digitsMatch = afterLetter1.match(/^(\d{1,3})/);
    const digits = digitsMatch ? digitsMatch[1] : "";
    let afterDigits = "";
    if (digits.length === 3) {
      afterDigits = afterLetter1.slice(digits.length).replace(/[^A-Z]/g, "").slice(0, 2);
    }

    let res = region + " " + letter1;
    if (digits) res += " " + digits;
    if (afterDigits) res += " " + afterDigits;
    return res;
  } else {
    // Case B: 3rd character is a digit (Legal: 01 777 AAA or Trailer: 01 1234 AA)
    const digitsMatch = rest.match(/^(\d{1,4})/);
    const digits = digitsMatch ? digitsMatch[1] : "";
    let afterDigits = "";
    if (digits.length >= 3) {
      afterDigits = rest.slice(digits.length).replace(/[^A-Z]/g, "").slice(0, 3);
    }

    let res = region + (digits ? " " + digits : "");
    if (afterDigits) res += " " + afterDigits;
    return res;
  }
}

/**
 * Validates if the plate number matches Uzbekistan vehicle formats.
 */
export function isValidPlateNumber(plate: string | null | undefined): boolean {
  if (!plate) return false;
  const clean = plate.replace(/\s+/g, "").toUpperCase();
  // Individual: 01A123AA
  const individualRegex = /^\d{2}[A-Z]\d{3}[A-Z]{2}$/;
  // Legal entity: 01123AAA
  const legalRegex = /^\d{2}\d{3}[A-Z]{3}$/;
  // Trailer/Motorcycle: 011234AA
  const specialRegex = /^\d{2}\d{4}[A-Z]{2}$/;

  return individualRegex.test(clean) || legalRegex.test(clean) || specialRegex.test(clean);
}

/**
 * Formats Uzbekistan mobile phone number as: +998 XX XXX XX XX
 * Prefix +998 cannot be modified or deleted.
 * When allowEmpty is true, returns empty string if no digits are entered.
 */
export function formatUzbekPhone(value: string, allowEmpty = false): string {
  if (!value || !value.trim()) {
    return allowEmpty ? "" : "+998 ";
  }

  // Extract all numeric digits
  let digits = value.replace(/\D/g, "");

  // If input started with country code 998, strip it to extract 9 national digits
  if (digits.startsWith("998")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("8") && digits.length === 10) {
    digits = digits.slice(1);
  }

  // Max 9 national digits (XX XXX XX XX)
  digits = digits.slice(0, 9);

  if (allowEmpty && digits.length === 0) {
    return "";
  }

  let formatted = "+998 ";
  if (digits.length === 0) {
    return formatted;
  }

  formatted += digits.slice(0, 2);
  if (digits.length > 2) {
    formatted += " " + digits.slice(2, 5);
  }
  if (digits.length > 5) {
    formatted += " " + digits.slice(5, 7);
  }
  if (digits.length > 7) {
    formatted += " " + digits.slice(7, 9);
  }

  return formatted;
}

/**
 * Validates if the phone number contains complete 9 national digits (+998 XX XXX XX XX).
 */
export function isValidUzbekPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("998")) {
    digits = digits.slice(3);
  }
  return digits.length === 9;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in the user's local timezone
 * (avoids UTC timezone shift issues where toISOString returns yesterday's date).
 */
export function getLocalDateString(dateInput: Date = new Date()): string {
  const year = dateInput.getFullYear();
  const month = String(dateInput.getMonth() + 1).padStart(2, "0");
  const day = String(dateInput.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const clean = dateString.split("T")[0];
    const parts = clean.split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}.${month}.${year}`;
    }
    return dateString;
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateTimeString: string | null | undefined): string {
  if (!dateTimeString) return "—";
  try {
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return dateTimeString;
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const mins = String(date.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${mins}`;
  } catch {
    return dateTimeString;
  }
}

export function getCarStatusInfo(status: string): { label: string; bg: string; text: string; dot: string } {
  switch (status) {
    case "available":
      return {
        label: "Bo'sh",
        bg: "bg-emerald-50 border-emerald-200",
        text: "text-emerald-700",
        dot: "bg-emerald-500",
      };
    case "rented":
      return {
        label: "Ijarada",
        bg: "bg-blue-50 border-blue-200",
        text: "text-blue-700",
        dot: "bg-blue-500",
      };
    case "maintenance":
      return {
        label: "Ta'mirda",
        bg: "bg-amber-50 border-amber-200",
        text: "text-amber-700",
        dot: "bg-amber-500",
      };
    default:
      return {
        label: status,
        bg: "bg-slate-50 border-slate-200",
        text: "text-slate-700",
        dot: "bg-slate-400",
      };
  }
}

export function getContractStatusInfo(
  hasActiveContract: boolean,
  isOverdue: boolean
): {
  key: "active" | "overdue" | "closed";
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  if (!hasActiveContract) {
    return {
      key: "closed",
      label: "Yopilgan",
      bg: "bg-slate-100",
      text: "text-slate-600",
      border: "border-slate-200",
    };
  }
  if (isOverdue) {
    return {
      key: "overdue",
      label: "Qarzdor",
      bg: "bg-rose-50",
      text: "text-rose-700",
      border: "border-rose-200",
    };
  }
  return {
    key: "active",
    label: "Faol",
    bg: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-200",
  };
}

export function getPaymentStatusInfo(status: string): { label: string; bg: string; text: string } {
  switch (status) {
    case "paid":
      return {
        label: "To'langan",
        bg: "bg-emerald-100",
        text: "text-emerald-800",
      };
    case "partial":
      return {
        label: "Qisman",
        bg: "bg-amber-100",
        text: "text-amber-800",
      };
    case "overdue":
      return {
        label: "Muddati o'tgan",
        bg: "bg-rose-100",
        text: "text-rose-700",
      };
    case "pending":
      return {
        label: "Kutilmoqda",
        bg: "bg-slate-100",
        text: "text-slate-700",
      };
    case "cancelled":
      return {
        label: "Bekor qilingan",
        bg: "bg-rose-100",
        text: "text-rose-700",
      };
    default:
      return {
        label: status,
        bg: "bg-slate-100",
        text: "text-slate-700",
      };
  }
}

/**
 * Strips all formatting from phone number to create a valid RFC 3966 URI
 * (e.g. "+998 90 123 45 67" -> "+998901234567") without illegal spaces.
 */
export function cleanPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("998")) {
    return `+${cleaned}`;
  }
  return cleaned;
}

/**
 * Initiates a phone call natively across standard mobile browsers and Telegram Mini App WebViews.
 */
export function initiatePhoneCall(phone: string | null | undefined): void {
  const clean = cleanPhoneNumber(phone);
  if (!clean || typeof window === "undefined") return;

  const telUri = `tel:${clean}`;
  try {
    const a = document.createElement("a");
    a.href = telUri;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {
        // ignore cleanup error
      }
    }, 150);
  } catch {
    window.location.href = telUri;
  }
}
