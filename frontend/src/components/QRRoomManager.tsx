"use client";

import React, { useState, useEffect } from "react";
import {
  QrCode,
  Building,
  Plus,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Bed,
  MapPin,
  Printer,
  Download,
  Eye,
  Lock,
  Wifi
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Room, User, api } from "@/lib/api";
import { RoomQRPlacardModal } from "@/components/RoomQRPlacardModal";
import { copyToClipboard } from "@/lib/clipboard";

interface QRRoomManagerProps {
  rooms: Room[];
  currentUser?: User | null;
  onCreateRoom: (data: { room_number: string; floor: string; wing: string; bed_count: number }) => void;
  onLaunchPatientQR: (token: string) => void;
}

export function QRRoomManager({
  rooms,
  currentUser,
  onCreateRoom,
  onLaunchPatientQR,
}: QRRoomManagerProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRoomForPlacard, setSelectedRoomForPlacard] = useState<Room | null>(null);
  const [roomNum, setRoomNum] = useState("");
  const [floor, setFloor] = useState("Floor 2");
  const [wing, setWing] = useState("East Wing");
  const [bedCount, setBedCount] = useState(1);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [lanIP, setLanIP] = useState("192.168.31.219");

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

  const isAdmin = currentUser?.role === "admin";
  const isProduction = typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : `http://${lanIP}:3000`;

  const getRoomUrl = (token: string) => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        return `${window.location.origin}/patient/qr/${encodeURIComponent(token)}`;
      }
    }
    return `http://${lanIP}:3000/patient/qr/${encodeURIComponent(token)}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      alert("Permission Denied: Only administrators can create room QR codes.");
      return;
    }
    if (!roomNum.trim()) return;
    onCreateRoom({
      room_number: roomNum.trim(),
      floor,
      wing,
      bed_count: bedCount,
    });
    setShowCreateModal(false);
    setRoomNum("");
  };

  const handleCopy = async (token: string) => {
    const url = getRoomUrl(token);
    await copyToClipboard(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="p-5 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#176B63] text-white shadow-sm">
              <QrCode className="h-5 w-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#17212F] tracking-tight">
              Hospital Room QR Placards & Tokens
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#667085] mt-0.5 font-medium">
            Real 2D scannable QR endpoints installed at patient bedsides for anonymous, app-less service requests
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isAdmin ? (
            <>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F3F1] border border-[#A7D7D1] text-[#176B63] text-[11px] font-bold">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Admin Clearance: QR Generator Active</span>
              </span>

              {rooms.length > 0 && (
                <button
                  onClick={() => setSelectedRoomForPlacard(rooms[0])}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F7F8FA] border border-[#E5E9EF] text-[#17212F] text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Printer className="h-4 w-4 text-[#176B63]" />
                  <span>Print Placards</span>
                </button>
              )}

              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3.5 py-2 rounded-xl bg-[#176B63] hover:bg-[#10574F] text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Register Room & QR</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-sm font-semibold">
              <Lock className="h-4 w-4 shrink-0" />
              <span>Administrator clearance required to register rooms & generate QR codes</span>
            </div>
          )}
        </div>
      </div>

      {/* Admin Privilege Banner */}
      {!isAdmin && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-sm flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-[#D97706]" />
          <span>
            <strong>Read-Only Facilities View:</strong> You are signed in as <strong>{currentUser?.name || "Staff"}</strong> ({currentUser?.role}). Only Hospital Administrators have authority to create or modify patient QR endpoints.
          </span>
        </div>
      )}

      {/* Network QR Connection Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#E8F3F1] to-[#E0F2FE] border border-[#A7D7D1] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-[#176B63] flex items-center justify-center text-white shrink-0 shadow-sm">
            <Wifi className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#17212F]">
                {isProduction ? "Live Cloud Production QR Endpoints" : "Wi-Fi Network QR Live"}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#16805D] text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                {isProduction ? "Cloud Production" : "Active"}
              </span>
            </div>
            <p className="text-xs text-[#475467] mt-0.5 font-medium">
              {isProduction ? (
                <>
                  Bedside QR endpoints are live on your public production domain (scannable globally on any phone):{" "}
                  <code className="font-mono font-bold text-[#176B63] bg-white/70 px-1.5 py-0.5 rounded border border-[#A7D7D1]/50">
                    {currentOrigin}
                  </code>
                </>
              ) : (
                <>
                  Physical smartphones and tablets on this Wi-Fi can scan bedside QR codes directly at:{" "}
                  <code className="font-mono font-bold text-[#176B63] bg-white/70 px-1.5 py-0.5 rounded border border-[#A7D7D1]/50">
                    http://{lanIP}:3000
                  </code>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={isProduction ? currentOrigin : `http://${lanIP}:3000`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-[#17212F] text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
          >
            <span>{isProduction ? "Open Live Portal" : "Open Network URL"}</span>
            <ExternalLink className="h-3.5 w-3.5 text-[#176B63]" />
          </a>
        </div>
      </div>

      {/* Rooms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map((room) => {
          const qrTargetUrl = getRoomUrl(room.qr_token);

          return (
            <div
              key={room.id}
              className="bg-white rounded-3xl border-2 border-[#E5E9EF] p-6 shadow-sm flex flex-col justify-between space-y-5 hover:shadow-lg transition-all group"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-base sm:text-lg text-[#17212F] flex items-center gap-2.5">
                    <Building className="h-5 w-5 text-[#176B63]" />
                    <span>{room.room_number}</span>
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#EDF7F2] text-[#16805D] border border-[#A6E1CE]">
                    Active Endpoint
                  </span>
                </div>

                <div className="text-sm text-[#667085] space-y-1.5 font-medium">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#98A2B3]" />
                    <span>
                      {room.floor} • {room.wing}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bed className="h-4 w-4 text-[#98A2B3]" />
                    <span>{room.bed_count} Inpatient Bed(s)</span>
                  </div>
                </div>

                {/* VISUAL REAL 2D SCANNABLE QR CODE DISPLAY (LARGER SIZE) */}
                <div className="p-4 bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] flex items-center gap-4">
                  <div className="bg-white p-2 rounded-xl border border-[#CBD5E1] shrink-0 shadow-xs">
                    <QRCodeSVG
                      value={qrTargetUrl}
                      size={92}
                      level="M"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <span className="text-xs text-[#64748B] uppercase font-extrabold block">
                      Bedside QR Code
                    </span>
                    <span className="font-mono text-sm font-bold text-[#176B63] block truncate">
                      {room.qr_token}
                    </span>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleCopy(room.qr_token)}
                        className="px-3 py-1 rounded-lg bg-white hover:bg-[#EEF4FD] border border-[#CBD5E1] text-xs font-bold text-[#17212F] flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Copy QR scan link"
                      >
                        {copiedToken === room.qr_token ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-[#16805D]" />
                            <span className="text-[#16805D]">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => setSelectedRoomForPlacard(room)}
                  className="py-3 px-4 rounded-2xl border-2 border-[#176B63] bg-[#E8F3F1] hover:bg-[#D4ECE8] text-[#176B63] text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                  title="View and print bedside placard with QR code"
                >
                  <QrCode className="h-4.5 w-4.5" />
                  <span>Placard & QR</span>
                </button>

                <button
                  onClick={() => onLaunchPatientQR(room.qr_token)}
                  className="py-3 px-4 rounded-2xl bg-[#17212F] hover:bg-[#253245] text-white text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                  title="Test patient form for this room"
                >
                  <Eye className="h-4 w-4" />
                  <span>Open Portal</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bedside Placard & QR Code Modal */}
      {selectedRoomForPlacard && (
        <RoomQRPlacardModal
          room={{
            room_number: selectedRoomForPlacard.room_number,
            floor: selectedRoomForPlacard.floor,
            wing: selectedRoomForPlacard.wing,
            qr_token: selectedRoomForPlacard.qr_token,
          }}
          allRooms={rooms}
          onSelectRoom={(r) => setSelectedRoomForPlacard(r)}
          onClose={() => setSelectedRoomForPlacard(null)}
        />
      )}

      {/* Modal: Create Room (Admin Only) */}
      {showCreateModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl max-w-md w-full p-8 border border-[#E5E9EF] shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
          >
            <div className="border-b pb-4 border-[#E5E9EF]">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-[#E8F3F1] text-[#176B63]">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <h3 className="font-extrabold text-lg text-[#17212F]">Register New Room QR Point</h3>
              </div>
              <p className="text-sm text-[#667085] mt-1">Admin action: Generates a unique cryptographic QR token for patient bedside feedback</p>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-sm text-[#17212F]">Room Identifier *</label>
              <input
                required
                type="text"
                placeholder="e.g. Room 408 or ICU Bed 09"
                value={roomNum}
                onChange={(e) => setRoomNum(e.target.value)}
                className="w-full p-3.5 rounded-2xl border-2 border-[#CBD5E1] text-base bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-[#176B63]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-sm text-[#17212F]">Floor</label>
              <input
                type="text"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                className="w-full p-3.5 rounded-2xl border-2 border-[#CBD5E1] text-base bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-[#176B63]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-sm text-[#17212F]">Wing / Department</label>
              <input
                type="text"
                value={wing}
                onChange={(e) => setWing(e.target.value)}
                className="w-full p-3.5 rounded-2xl border-2 border-[#CBD5E1] text-base bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-[#176B63]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-sm text-[#17212F]">Inpatient Beds</label>
              <input
                type="number"
                min={1}
                max={20}
                value={bedCount}
                onChange={(e) => setBedCount(parseInt(e.target.value) || 1)}
                className="w-full p-3.5 rounded-2xl border-2 border-[#CBD5E1] text-base bg-[#F8FAFC] focus:bg-white focus:outline-none focus:border-[#176B63]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-5 py-3 rounded-2xl border-2 border-[#E5E9EF] text-[#667085] hover:bg-[#F7F8FA] font-bold text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-3 rounded-2xl bg-[#176B63] hover:bg-[#10574F] text-white font-extrabold text-sm transition-all shadow-md cursor-pointer"
              >
                Generate Room & QR
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
