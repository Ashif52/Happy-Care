"use client";

import React, { use } from "react";
import { PatientPortal } from "@/components/PatientPortal";

export default function PatientQRClient({
  paramsPromise,
}: {
  paramsPromise: Promise<{ token: string }>;
}) {
  const { token } = use(paramsPromise);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#F1F6F4] sm:bg-gradient-to-br sm:from-[#EBF4F1] sm:via-[#F1F6F4] sm:to-[#E1EDE8] flex flex-col items-center justify-start sm:py-8 sm:px-6 overflow-x-hidden relative">
      {/* Decorative ambient hospital glow spots on desktop */}
      <div className="hidden sm:block absolute -top-40 -left-40 w-96 h-96 bg-teal-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="hidden sm:block absolute top-1/4 -right-40 w-96 h-96 bg-emerald-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="hidden sm:block absolute -bottom-40 left-1/3 w-96 h-96 bg-cyan-400/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Patient Surface - Luxury Responsive Width */}
      <div className="w-full max-w-4xl lg:max-w-5xl flex-1 bg-white sm:rounded-3xl sm:border sm:border-slate-200/80 sm:shadow-[0_20px_50px_rgba(15,76,71,0.12)] overflow-hidden relative flex flex-col z-10 transition-all">
        <PatientPortal initialRoomToken={token} />
      </div>
    </div>
  );
}
