"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CarendaSkeleton } from "@/components/CarendaSkeleton";
import { getCachedBootstrapSync } from "@/lib/api";

const CarendaApp = dynamic(
  () => import("@/components/CarendaApp").then((mod) => mod.CarendaApp),
  {
    ssr: false,
    loading: () => <CarendaSkeleton />,
  }
);

export default function Home() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(() => {
    const cached = getCachedBootstrapSync();
    if (!cached?.me) return null;
    if (!cached.me.is_onboarded) return false;
    if (cached.me.role === "ijarachi" || cached.me.role === "user") return false;
    return true;
  });

  useEffect(() => {
    const cached = getCachedBootstrapSync();
    if (cached?.me) {
      if (!cached.me.is_onboarded) {
        router.replace("/login");
        setAuthorized(false);
      } else if (cached.me.role === "ijarachi" || cached.me.role === "user") {
        router.replace("/client");
        setAuthorized(false);
      } else {
        setAuthorized(true);
      }
    }
  }, [router]);

  if (authorized === false) {
    return <CarendaSkeleton />;
  }

  return <CarendaApp />;
}
