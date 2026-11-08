"use client";

import dynamic from "next/dynamic";
import { CarendaSkeleton } from "@/components/CarendaSkeleton";

const CarendaApp = dynamic(
  () => import("@/components/CarendaApp").then((mod) => mod.CarendaApp),
  {
    ssr: false,
    loading: () => <CarendaSkeleton />,
  }
);

export default function Home() {
  return <CarendaApp />;
}
