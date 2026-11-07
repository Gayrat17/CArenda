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

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  try {
    const [year, month, day] = dateString.split("T")[0].split("-");
    if (!year || !month || !day) return dateString;
    return `${day}.${month}.${year}`;
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
