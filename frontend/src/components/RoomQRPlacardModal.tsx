"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Printer,
  Download,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Building,
  Smartphone,
  QrCode,
  Wifi,
  Radio,
  Globe
} from "lucide-react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { Room, api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

interface RoomQRPlacardModalProps {
  room: {
    room_number: string;
    floor: string;
    wing: string;
    qr_token: string;
  };
  allRooms?: Room[];
  onSelectRoom?: (room: Room) => void;
  onClose: () => void;
}

export function RoomQRPlacardModal({
  room,
  allRooms,
  onSelectRoom,
  onClose,
}: RoomQRPlacardModalProps) {
  const [copied, setCopied] = useState(false);
  const [lanIP, setLanIP] = useState("192.168.31.219");
  const [hostMode, setHostMode] = useState<"lan" | "localhost" | "current" | "custom">("lan");
  const [customHost, setCustomHost] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

  // Fetch detected network LAN IP from backend
  useEffect(() => {
    api.getNetworkHost()
      .then((data) => {
        if (data.lan_ip) {
          setLanIP(data.lan_ip);
        }
      })
      .catch(() => {});
  }, []);

  const getTargetURL = () => {
    let base = `http://${lanIP}:3000`;
    if (hostMode === "lan") {
      base = `http://${lanIP}:3000`;
    } else if (hostMode === "current") {
      const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
      base = isLocal ? `http://${lanIP}:3000` : (typeof window !== "undefined" ? window.location.origin : `http://${lanIP}:3000`);
    } else if (hostMode === "localhost") {
      base = "http://localhost:3000";
    } else if (hostMode === "custom" && customHost.trim()) {
      base = customHost.trim().startsWith("http") ? customHost.trim() : `http://${customHost.trim()}`;
    }
    return `${base}/patient/qr/${encodeURIComponent(room.qr_token)}`;
  };

  const targetURL = getTargetURL();

  const handleCopy = async () => {
    await copyToClipboard(targetURL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPNG = () => {
    const canvas = canvasRef.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `HappyCare-Bedside-QR-${room.room_number.replace(/\s+/g, "_")}.png`;
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-[#E5E9EF] shadow-2xl overflow-hidden flex flex-col my-auto animate-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-[#E5E9EF] flex items-center justify-between bg-[#F7F8FA]">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#176B63] flex items-center justify-center text-white">
              <QrCode className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#17212F]">
                Bedside Patient QR Code Placard
              </h3>
              <p className="text-[11px] text-[#667085]">
                Scannable with any smartphone camera (iOS & Android)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#667085] hover:text-[#17212F] hover:bg-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Room Switcher if multiple rooms provided */}
        {allRooms && allRooms.length > 1 && onSelectRoom && (
          <div className="px-6 py-2.5 bg-[#EEF4FD] border-b border-[#BFDBFE] flex items-center justify-between text-xs">
            <span className="text-[#3868C9] font-semibold">Generate for different room:</span>
            <select
              value={room.qr_token}
              onChange={(e) => {
                const found = allRooms.find((r) => r.qr_token === e.target.value);
                if (found) onSelectRoom(found);
              }}
              className="px-2.5 py-1 rounded-lg bg-white border border-[#BFDBFE] text-xs font-semibold text-[#17212F] focus:outline-none cursor-pointer"
            >
              {allRooms.map((r) => (
                <option key={r.id} value={r.qr_token}>
                  {r.room_number} ({r.wing})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Network Connection Status Banner */}
        <div className="mx-6 mt-4 p-3 rounded-2xl bg-gradient-to-r from-[#EDF7F2] to-[#E8F3F1] border border-[#A6E1CE] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16805D] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#16805D]"></span>
            </span>
            <div>
              <strong className="text-[#16805D] block">
                {hostMode === "current" ? "Public Mobile Scannable" : "Local Wi-Fi Network"}
              </strong>
              <span className="text-[#475569] text-[11px]">
                Domain: <code className="font-mono text-[#0F172A] font-bold">{targetURL.replace(/\/patient\/qr\/.*$/, "")}</code>
              </span>
            </div>
          </div>
          <span className="text-[10px] font-bold uppercase bg-white text-[#16805D] border border-[#A6E1CE] px-2 py-0.5 rounded-full">
            Mobile Scannable
          </span>
        </div>

        {/* Printable Placard Container */}
        <div className="p-6 sm:p-7 flex flex-col items-center text-center space-y-4 bg-white print:p-0">
          {/* Hospital Header Header on Placard */}
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F3F1] border border-[#A7D7D1] text-[#176B63] text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="h-4 w-4" />
              <span>Happy Care Hospital Assist</span>
            </div>
            <h2 className="text-xl font-black text-[#17212F] tracking-tight">
              {room.room_number}
            </h2>
            <div className="text-xs text-[#667085] flex items-center justify-center gap-1.5 font-medium">
              <Building className="h-3.5 w-3.5" />
              <span>{room.wing} • {room.floor}</span>
            </div>
          </div>

          {/* THE REAL SCANNABLE QR CODE */}
          <div className="p-4 bg-white rounded-3xl border-2 border-[#176B63] shadow-lg flex flex-col items-center justify-center relative group">
            <QRCodeSVG
              value={targetURL}
              size={210}
              level="H"
              includeMargin={true}
            />
            {/* Hidden canvas for PNG export */}
            <div ref={canvasRef} className="hidden">
              <QRCodeCanvas
                value={targetURL}
                size={512}
                level="H"
                includeMargin={true}
              />
            </div>
          </div>

          {/* Scannable Guidance Instructions */}
          <div className="space-y-1 max-w-sm">
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#17212F]">
              <Smartphone className="h-4 w-4 text-[#176B63]" />
              <span>Scan with your smartphone camera</span>
            </div>
            <p className="text-[11px] text-[#667085] leading-relaxed">
              Connect to the same Wi-Fi and point your camera at this QR code to request Nursing, Maintenance, Housekeeping, or Dietary services immediately.
            </p>
          </div>

          {/* Token Reference & URL */}
          <div className="w-full p-3 rounded-2xl bg-[#F8FAFC] border border-[#CBD5E1] text-left text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">
                Bedside Target URL
              </span>
              <span className="font-mono text-[10px] font-bold text-[#176B63] bg-white px-2 py-0.5 rounded border border-[#CBD5E1]">
                {room.qr_token}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-[#0F172A] truncate flex-1 select-all font-semibold">
                {targetURL}
              </span>
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[11px] font-bold text-[#0F172A] flex items-center gap-1 shrink-0 cursor-pointer"
              >
                {copied ? <Check className="h-3 w-3 text-[#16805D]" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {/* Network Host Switcher */}
          <div className="w-full space-y-2 pt-1 border-t border-[#F1F5F9] text-left text-xs">
            <div className="flex items-center justify-between text-[11px] text-[#64748B]">
              <span className="font-bold flex items-center gap-1">
                <Wifi className="h-3.5 w-3.5 text-[#176B63]" />
                <span>QR Network Target:</span>
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setHostMode("lan")}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    hostMode === "lan"
                      ? "bg-[#176B63] text-white shadow-xs"
                      : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                  }`}
                  title="Direct Local Wi-Fi connection"
                >
                  Wi-Fi ({lanIP})
                </button>
                <button
                  onClick={() => setHostMode("localhost")}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    hostMode === "localhost"
                      ? "bg-[#176B63] text-white shadow-xs"
                      : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                  }`}
                >
                  Localhost
                </button>
                <button
                  onClick={() => setHostMode("current")}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    hostMode === "current"
                      ? "bg-[#176B63] text-white shadow-xs"
                      : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                  }`}
                >
                  🌐 Production
                </button>
              </div>
            </div>

            {hostMode === "custom" && (
              <div className="flex gap-2 animate-in fade-in duration-150">
                <input
                  type="text"
                  placeholder="e.g. http://192.168.1.50:3000"
                  value={customHost}
                  onChange={(e) => setCustomHost(e.target.value)}
                  className="w-full p-2 rounded-xl border border-[#CBD5E1] text-xs font-mono focus:outline-none focus:border-[#176B63]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="p-4 bg-[#F7F8FA] border-t border-[#E5E9EF] flex flex-wrap items-center justify-between gap-3">
          <a
            href={targetURL}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-[#176B63] hover:underline flex items-center gap-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open in Browser</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPNG}
              className="px-3.5 py-2 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-bold text-[#0F172A] flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-[#176B63]" />
              <span>Download PNG</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-[#176B63] hover:bg-[#10574F] text-white text-xs font-black flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Placard</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
