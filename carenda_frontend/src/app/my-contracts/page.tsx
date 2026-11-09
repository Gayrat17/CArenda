"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MyContractsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/client");
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
