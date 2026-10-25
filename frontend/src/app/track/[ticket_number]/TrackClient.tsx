"use client";

import React, { use, useState, useEffect } from "react";
import {
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  CheckCircle2,
  UserCheck,
} from "lucide-react";
import { api, formatTime, formatDateTime } from "@/lib/api";

export default function TrackClient({
  paramsPromise,
}: {
  paramsPromise: Promise<{ ticket_number: string }>;
}) {
  const { ticket_number: ticketNumber } = use(paramsPromise);

  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const fetchStatus = async () => {
    try {
      // Check query parameter for secure tracking token if present
      const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
      const data = await api.getPatientTicketStatus(ticketNumber, token || undefined);
      setTicket(data);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (err: any) {
      setError(err.message || "Failed to load service ticket.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Setup Real-time SSE listener
    let sse: EventSource | null = null;
    try {
      const sseUrl = api.getPatientStreamUrl(ticketNumber);
      sse = new EventSource(sseUrl);

      sse.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.event === "ticket_updated" && payload.data) {
            fetchStatus();
          }
        } catch (_) {}
      };

      sse.addEventListener("ticket_updated", () => {
        fetchStatus();
      });
    } catch (_) {}

    const interval = setInterval(fetchStatus, 4000);

    return () => {
      clearInterval(interval);
      if (sse) sse.close();
    };
  }, [ticketNumber]);

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#F0F2F5] flex flex-col items-center p-3 sm:p-6 py-6 sm:py-10 overflow-x-hidden">
      <div className="w-full max-w-lg mb-3 flex items-center justify-between text-xs text-[#475467] px-2">
        <a
          href="/"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5E9EF] hover:bg-[#F8F9FA] text-[#17212F] font-semibold transition text-xs shadow-2xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Home</span>
        </a>
        <span className="font-mono bg-white border border-[#E5E9EF] px-2.5 py-1 rounded-lg text-[#17212F] font-bold text-xs shadow-2xs">
          Ref: {ticketNumber}
        </span>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-[#E5E9EF] overflow-hidden flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E9EF] p-4.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#3868C9] flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-[#17212F]">
                CareOps Patient Service Tracker
              </h1>
              <p className="text-xs text-[#667085]">Live Resolution Updates & ETA</p>
            </div>
          </div>
          <button
            onClick={fetchStatus}
            className="p-2 rounded-xl text-[#667085] hover:text-[#17212F] hover:bg-[#F7F8FA] transition cursor-pointer"
            title="Refresh status"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </header>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5">
          {loading ? (
            <div className="py-20 text-center text-sm text-[#667085]">
              <div className="animate-spin h-7 w-7 border-3 border-[#3868C9] border-t-transparent rounded-full mx-auto mb-3" />
              <span>Connecting to hospital service desk...</span>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] text-center space-y-2">
              <AlertCircle className="h-8 w-8 mx-auto" />
              <h3 className="font-bold text-sm">Request Not Found</h3>
              <p className="text-xs">{error}</p>
            </div>
          ) : ticket ? (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Dynamic Live Status & Arrival Banner */}
              {(() => {
                const isAcknowledged = ticket.status === "acknowledged";
                const isWorking = ["in_progress", "work_started"].includes(ticket.status);
                const isWorkCompleted = ["resolution_submitted", "work_completed"].includes(ticket.status);
                const isClosed = ticket.status === "closed";

                if (isAcknowledged) {
                  return (
                    <div className="p-4 rounded-xl bg-[#EEF4FD] border-2 border-[#BFDBFE] text-xs flex items-center justify-between shadow-2xs animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg text-[#3868C9] shadow-2xs">
                          <Clock className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#3868C9] block">
                            Estimated Arrival
                          </span>
                          <strong className="text-sm font-black text-[#17212F]">
                            {ticket.estimated_arrival_minutes || 10}–{((ticket.estimated_arrival_minutes || 10) + 5)} Minutes
                          </strong>
                          <span className="text-[11px] text-[#475467] block">
                            Staff acknowledged and en route to {ticket.room_number}
                          </span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-white text-[11px] font-bold text-[#3868C9] border border-[#BFDBFE] shrink-0">
                        Technician En Route
                      </span>
                    </div>
                  );
                }

                if (isWorking) {
                  return (
                    <div className="p-4 rounded-xl bg-[#EDF7F2] border-2 border-[#A6E1CE] text-xs flex items-center justify-between shadow-2xs animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg text-[#16805D] shadow-2xs">
                          <UserCheck className="h-5 w-5 text-[#16805D]" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#16805D] block">
                            Staff Arrived On-Site
                          </span>
                          <strong className="text-sm font-black text-[#0F172A]">
                            Staff Has Arrived at {ticket.room_number}
                          </strong>
                          <span className="text-[11px] text-[#334155] block">
                            {ticket.assigned_staff_name ? `${ticket.assigned_staff_name} is` : "Technician is"} actively attending to your request
                          </span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-white text-[11px] font-black text-[#16805D] border border-[#A6E1CE] shrink-0">
                        Work in Progress
                      </span>
                    </div>
                  );
                }

                if (isWorkCompleted) {
                  return (
                    <div className="p-4 rounded-xl bg-[#F0FDF4] border-2 border-[#86EFAC] text-xs flex items-center justify-between shadow-2xs animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg text-[#15803D] shadow-2xs">
                          <CheckCircle2 className="h-5 w-5 text-[#15803D]" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#15803D] block">
                            Service Completed
                          </span>
                          <strong className="text-sm font-black text-[#0F172A]">
                            Staff Has Completed the Service
                          </strong>
                          <span className="text-[11px] text-[#334155] block">
                            Work completed with safety standards; awaiting final sign-off
                          </span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-white text-[11px] font-black text-[#15803D] border border-[#86EFAC] shrink-0">
                        Work Completed
                      </span>
                    </div>
                  );
                }

                if (isClosed) {
                  return (
                    <div className="p-4 rounded-xl bg-[#EDF7F2] border-2 border-[#A6E1CE] text-xs flex items-center justify-between shadow-2xs animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg text-[#16805D] shadow-2xs">
                          <CheckCircle2 className="h-5 w-5 text-[#16805D]" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#16805D] block">
                            Resolved & Closed
                          </span>
                          <strong className="text-sm font-black text-[#0F172A]">
                            Issue Officially Resolved
                          </strong>
                          <span className="text-[11px] text-[#334155] block">
                            Inspected and closed by hospital supervisor
                          </span>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-white text-[11px] font-black text-[#16805D] border border-[#A6E1CE] shrink-0">
                        Closed
                      </span>
                    </div>
                  );
                }

                return null;
              })()}

              {/* Status Header Badge */}
              <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#E5E9EF] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wider block">
                    Current Stage
                  </span>
                  <span className="text-sm font-bold text-[#17212F]">
                    {ticket.friendly_status}
                  </span>
                </div>
                <div className="px-3 py-1 rounded-full bg-white border border-[#E5E9EF] text-xs font-bold text-[#17212F] shadow-2xs capitalize">
                  {ticket.status.replace("_", " ")}
                </div>
              </div>

              {/* Ticket Details */}
              <div className="bg-[#FAFBFD] p-4 rounded-xl border border-[#E5E9EF] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#667085]">Reference Number:</span>
                  <strong className="font-mono text-[#17212F]">{ticket.ticket_number}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085]">Location:</span>
                  <strong className="text-[#17212F]">{ticket.room_number}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085]">Department:</span>
                  <strong className="text-[#17212F] capitalize">{ticket.department_name || ticket.department_id}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085]">Category:</span>
                  <strong className="text-[#17212F]">{ticket.category}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#667085]">Submitted At:</span>
                  <span className="text-[#17212F]">
                    {formatDateTime(ticket.created_at)}
                  </span>
                </div>
              </div>

              {/* Priority Escalation Badge if Active */}
              {ticket.is_escalated && (
                <div className="p-3.5 rounded-xl bg-[#FEF3F2] border border-[#FECDCA] text-[#B42318] text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Priority Escalation Active (Level {ticket.escalation_level || 1})</span>
                  </div>
                  <p className="text-[11px] text-[#B42318]/90">
                    Department supervisor notified. Direct monitoring in progress.
                  </p>
                </div>
              )}
              {/* 5-Step Visual Progress Tracker */}
              <div className="space-y-3 pt-1">
                <h3 className="text-xs font-bold text-[#17212F] uppercase tracking-wider">
                  Resolution Milestones
                </h3>

                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E5E9EF]">
                  {[
                    {
                      label: "1. Request Received",
                      desc: "Ticket registered in department queue",
                      active: true,
                      timestamp: ticket.created_at,
                    },
                    {
                      label: "2. Awaiting Department Review",
                      desc: "Supervisors reviewing request details",
                      active: true,
                      timestamp: ticket.created_at,
                    },
                    {
                      label: "3. Assigned to Care Team",
                      desc: ticket.assigned_staff_name
                        ? `Assigned to ${ticket.assigned_staff_name}`
                        : "Awaiting supervisor assignment",
                      active: !!ticket.assigned_staff_id,
                      timestamp: ticket.assigned_at,
                    },
                    {
                      label: "4. Work Started",
                      desc: "Staff member has started work at location",
                      active: [
                        "in_progress",
                        "work_started",
                        "work_completed",
                        "resolution_submitted",
                        "closed",
                      ].includes(ticket.status),
                      timestamp: ticket.in_progress_at || ticket.work_started_at,
                    },
                    {
                      label: "5. Request Resolved",
                      desc: "Work completed and verified",
                      active: ["closed", "work_completed", "resolution_submitted"].includes(
                        ticket.status
                      ),
                      timestamp: ticket.closed_at || ticket.work_completed_at,
                    },
                  ].map((st, idx) => (
                    <div key={idx} className="relative flex items-start gap-3">
                      <div
                        className={`absolute -left-6 top-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          st.active
                            ? "bg-[#3868C9] text-white shadow-2xs"
                            : "bg-white border border-[#D0D5DD] text-[#98A2B3]"
                        }`}
                      >
                        {st.active ? "✓" : idx + 1}
                      </div>
                      <div>
                        <span
                          className={`text-xs block font-bold ${
                            st.active ? "text-[#17212F]" : "text-[#98A2B3]"
                          }`}
                        >
                          {st.label}
                        </span>
                        <span className="text-[10px] text-[#64748B] block">{st.desc}</span>
                        {st.timestamp && (
                          <span className="text-[10px] text-[#667085]">
                            {formatTime(st.timestamp)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Issue-Resolved Confirmation Card (Section 8) */}
              {(ticket.ready_for_feedback ||
                ["closed", "work_completed", "resolution_submitted"].includes(ticket.status)) && (
                <div className="bg-white rounded-xl border-2 border-[#16805D] p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2.5 text-[#16805D]">
                    <div className="p-2 rounded-xl bg-[#EDF7F2]">
                      <CheckCircle2 className="h-5 w-5 text-[#16805D]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[#0F172A]">
                        Your request has been resolved.
                      </h3>
                      <span className="text-[11px] font-mono text-[#16805D] font-bold">
                        Reference: {ticket.ticket_number}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] space-y-2 text-xs">
                    <div className="flex justify-between text-[#64748B]">
                      <span>Department:</span>
                      <span className="font-bold text-[#0F172A] capitalize">
                        {ticket.department_name || ticket.department_id}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#64748B]">
                      <span>Service Category:</span>
                      <span className="font-semibold text-[#0F172A]">{ticket.category}</span>
                    </div>
                    <div className="flex justify-between text-[#64748B]">
                      <span>Location:</span>
                      <span className="font-mono text-[#0F172A]">
                        {ticket.room_number || "Room Location"}
                      </span>
                    </div>
                    {ticket.resolution_summary && (
                      <div className="pt-2 border-t border-[#E2E8F0] space-y-1">
                        <span className="font-bold text-[#0F172A] block">Resolution Summary:</span>
                        <p className="text-[#475569] leading-relaxed">
                          {ticket.resolution_summary}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {lastUpdated && (
                <div className="text-center text-[10px] text-[#98A2B3]">
                  Live hospital telemetry active &bull; Last updated at {lastUpdated}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
