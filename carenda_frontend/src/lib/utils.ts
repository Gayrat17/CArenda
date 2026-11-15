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

export const UZBEK_OPERATOR_CODES = [
  "90", "91", "93", "94", "95", "97", "98", "99",
  "33", "50", "55", "71", "77", "78", "88",
] as const;

export const UZBEK_REGION_CODES: Record<string, string> = {
  "01": "Toshkent shahri",
  "10": "Toshkent viloyati",
  "20": "Sirdaryo viloyati",
  "25": "Jizzax viloyati",
  "30": "Samarqand viloyati",
  "40": "Farg'ona viloyati",
  "50": "Namangan viloyati",
  "60": "Andijon viloyati",
  "70": "Qashqadaryo viloyati",
  "75": "Surxondaryo viloyati",
  "80": "Buxoro viloyati",
  "85": "Navoiy viloyati",
  "90": "Xorazm viloyati",
  "95": "Qoraqalpog'iston R.",
};

const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  А: "A", В: "B", С: "C", Е: "E", Н: "H", К: "K",
  М: "M", О: "O", Р: "P", Т: "T", Х: "X", У: "Y",
};

/**
 * Formats car license plate in Uzbekistan standard formats:
 * - Individual: 01 A 777 AA (2 digits region + 1 Latin letter + 3 digits + 2 Latin letters)
 * - Legal entity: 01 777 AAA (2 digits region + 3 digits + 3 Latin letters)
 * Auto-converts Cyrillic keyboard characters to uppercase Latin and strictly formats spacing.
 */
export function formatPlateNumber(value: string): string {
  if (!value) return "";
  let clean = value.toUpperCase();
  for (const [cyr, lat] of Object.entries(CYRILLIC_TO_LATIN_MAP)) {
    clean = clean.split(cyr).join(lat);
  }
  const raw = clean.replace(/[^A-Z0-9]/g, "");
  if (!raw) return "";

  // Plate must start with region code digits
  const startDigits = raw.replace(/^[^0-9]+/, "");
  if (!startDigits) return "";

  const region = startDigits.slice(0, 2);
  if (startDigits.length <= 2) return region;

  const rest = startDigits.slice(2);
  // Case A: 3rd character is a Latin letter (Individual: 01 A 777 AA)
  if (/^[A-Z]/.test(rest)) {
    const letter1 = rest[0];
    const afterLetter1 = rest.slice(1);
    const digitsPart = (afterLetter1.match(/^\d{1,3}/) || [""])[0];
    const afterDigits = afterLetter1.slice(digitsPart.length).replace(/[^A-Z]/g, "").slice(0, 2);

    let res = region + " " + letter1;
    if (digitsPart) res += " " + digitsPart;
    if (afterDigits) res += " " + afterDigits;
    return res;
  } else if (/^\d/.test(rest)) {
    // Case B: 3rd character is a digit (Legal entity: 01 777 AAA)
    const digitsPart = (rest.match(/^\d{1,3}/) || [""])[0];
    const afterDigits = rest.slice(digitsPart.length).replace(/[^A-Z]/g, "").slice(0, 3);

    let res = region + " " + digitsPart;
    if (afterDigits) res += " " + afterDigits;
    return res;
  }

  return region;
}

export interface UzbekPlateInfo {
  clean: string;
  region: string;
  hasRegion: boolean;
  isRegionValid: boolean;
  regionName: string | null;
  plateType: "individual" | "legal" | null;
  isComplete: boolean;
  isValid: boolean;
  error: string | null;
}

/**
 * Returns comprehensive region, type and validation metadata for Uzbekistan vehicle plate.
 */
export function getUzbekPlateInfo(plate: string | null | undefined): UzbekPlateInfo {
  if (!plate || !plate.trim()) {
    return {
      clean: "",
      region: "",
      hasRegion: false,
      isRegionValid: false,
      regionName: null,
      plateType: null,
      isComplete: false,
      isValid: false,
      error: null,
    };
  }

  const clean = plate.trim().toUpperCase();
  const raw = clean.replace(/[^A-Z0-9]/g, "");
  const region = raw.slice(0, 2);
  const hasRegion = region.length === 2 && /^\d{2}$/.test(region);
  const regionName = hasRegion ? (UZBEK_REGION_CODES[region] || null) : null;
  const isRegionValid = Boolean(regionName);

  const isIndividual = /^\d{2}\s?[A-Z]\s?\d{3}\s?[A-Z]{2}$/.test(clean);
  const isLegal = /^\d{2}\s?\d{3}\s?[A-Z]{3}$/.test(clean);

  const plateType: "individual" | "legal" | null = isIndividual
    ? "individual"
    : isLegal
    ? "legal"
    : /^\d{2}\s?[A-Z]/.test(clean)
    ? "individual"
    : /^\d{2}\s?\d/.test(clean)
    ? "legal"
    : null;

  const isComplete = isIndividual || isLegal;
  const isValid = isRegionValid && isComplete;

  let error: string | null = null;
  if (hasRegion && !isRegionValid) {
    error = "Mavjud bo'lmagan hudud kodi";
  } else if (raw.length > 2 && !isComplete) {
    error = "Format: 01 A 777 AA yoki 01 777 AAA";
  }

  return {
    clean,
    region,
    hasRegion,
    isRegionValid,
    regionName,
    plateType,
    isComplete,
    isValid,
    error,
  };
}

/**
 * Validates if the plate number matches Uzbekistan vehicle formats and has valid region code.
 */
export function isValidPlateNumber(plate: string | null | undefined): boolean {
  return getUzbekPlateInfo(plate).isValid;
}

/**
 * Formats Uzbekistan mobile phone number as: +998 (XX) XXX-XX-XX
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

  if (digits.length === 0) {
    return "+998 ";
  }

  if (digits.length <= 2) {
    return `+998 (${digits}`;
  }

  if (digits.length <= 5) {
    return `+998 (${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 7) {
    return `+998 (${digits.slice(0, 2)}) ${digits.slice(2, 5)}-${digits.slice(5)}`;
  }

  return `+998 (${digits.slice(0, 2)}) ${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7, 9)}`;
}

export interface UzbekPhoneInfo {
  digits: string;
  operator: string;
  hasOperator: boolean;
  isValidOperator: boolean;
  isComplete: boolean;
  isValid: boolean;
  backendPhone: string;
  error: string | null;
}

/**
 * Validates Uzbekistan phone number for valid operator code and completeness.
 */
export function validateUzbekPhone(phone: string | null | undefined): UzbekPhoneInfo {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("998")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("8") && digits.length === 10) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 9);

  const operator = digits.slice(0, 2);
  const hasOperator = digits.length >= 2;
  const isValidOperator = !hasOperator || (UZBEK_OPERATOR_CODES as readonly string[]).includes(operator);
  const isComplete = digits.length === 9;
  const isValid = isComplete && isValidOperator;
  const backendPhone = digits.length === 9 ? `+998${digits}` : "";

  let error: string | null = null;
  if (hasOperator && !isValidOperator) {
    error = "Noto'g'ri operator kodi kiritildi";
  } else if (!isComplete && digits.length > 0) {
    error = "Telefon raqami to'liq kiritilishi shart";
  }

  return {
    digits,
    operator,
    hasOperator,
    isValidOperator,
    isComplete,
    isValid,
    backendPhone,
    error,
  };
}

/**
 * Cleans phone number to standard backend format: +998XXXXXXXXX (no spaces or formatting characters).
 */
export function cleanPhoneForBackend(phone: string | null | undefined): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("998")) {
    digits = digits.slice(3);
  } else if (digits.startsWith("8") && digits.length === 10) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 9);
  return digits.length === 9 ? `+998${digits}` : "";
}

/**
 * Validates if the phone number contains valid operator code and complete 9 national digits.
 */
export function isValidUzbekPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return validateUzbekPhone(phone).isValid;
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
