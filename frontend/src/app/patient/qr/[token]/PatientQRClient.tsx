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
    <div className="min-h-screen min-h-[100dvh] bg-[#17212F] flex flex-col items-center p-2 sm:p-6 py-4 sm:py-8 overflow-x-hidden">
      <div className="w-full max-w-lg mb-2 flex items-center justify-between text-xs text-white/90 px-2">
        <span className="font-semibold text-white">Bedside Care Point</span>
        <a
          href="/"
          className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors text-xs"
        >
          Staff Portal
        </a>
      </div>

      <div className="w-full max-w-lg min-h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden relative flex flex-col">
        <PatientPortal initialRoomToken={token} />
      </div>
    </div>
  );
}
