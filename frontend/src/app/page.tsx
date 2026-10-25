"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { OverviewDashboard } from "@/components/OverviewDashboard";
import { TicketTable } from "@/components/TicketTable";
import { TicketDetailView } from "@/components/TicketDetailView";
import { AIVerificationCenter } from "@/components/AIVerificationCenter";
import { PatientPortal } from "@/components/PatientPortal";
import { StaffWorkspace } from "@/components/StaffWorkspace";
import { SLAPoliciesView } from "@/components/SLAPoliciesView";
import { QRRoomManager } from "@/components/QRRoomManager";
import { AuditLogsView } from "@/components/AuditLogsView";
import { CreateTicketModal } from "@/components/CreateTicketModal";
import { PortalLoginGateway } from "@/components/PortalLoginGateway";
import { RoomQRPlacardModal } from "@/components/RoomQRPlacardModal";
import { StaffAccessManagementView } from "@/components/StaffAccessManagementView";
import { AnalyticsReportsView } from "@/components/AnalyticsReportsView";
import { ReviewsModuleView } from "@/components/reviews/ReviewsModuleView";
import { AdminManagementView } from "@/components/superadmin/AdminManagementView";
import { SystemSecurityView } from "@/components/superadmin/SystemSecurityView";
import { SuperAdminAuditView } from "@/components/superadmin/SuperAdminAuditView";
import { DatabaseMaintenanceView } from "@/components/superadmin/DatabaseMaintenanceView";
import { NPSModuleView } from "@/components/nps/NPSModuleView";
import { EmailDeliveryManager } from "@/components/EmailDeliveryManager";
import { PatientAccountsView } from "@/components/PatientAccountsView";
import { EditProfileModal } from "@/components/common/EditProfileModal";
import { QrCode, Bell, Sparkles, Lock, Trash2, CheckCircle2 } from "lucide-react";

import {
  api,
  User,
  Ticket,
  Department,
  Room,
  SLAPolicy,
  EscalationLog,
  DashboardMetrics,
  AuditLog,
  AIVerificationJob,
  SimulationAccount,
  setStoredToken,
  getStoredToken,
  clearStoredToken
} from "@/lib/api";

export default function CareOpsApp() {
  const [appMode, setAppMode] = useState<"gateway" | "authenticated" | "patient">("gateway");
  const [currentTab, setCurrentTab] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Core Data State
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [policies, setPolicies] = useState<SLAPolicy[]>([]);
  const [escalations, setEscalations] = useState<EscalationLog[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [aiQueue, setAiQueue] = useState<AIVerificationJob[]>([]);
  const [simulationAccounts, setSimulationAccounts] = useState<SimulationAccount[]>([]);

  // Modals / Overlays
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPatientPortal, setShowPatientPortal] = useState(false);
  const [patientRoomToken, setPatientRoomToken] = useState<string>("CARE-RM204-7X9Q");
  const [showDirectQRPlacard, setShowDirectQRPlacard] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunningSLACheck, setIsRunningSLACheck] = useState(false);
  const [incomingAlert, setIncomingAlert] = useState<{
    id: number;
    ticket_number: string;
    title: string;
    category: string;
    room_number: string;
    department_id: string;
    time: string;
  } | null>(null);

  // Cross-view ticket filter coordination
  const [ticketFilterState, setTicketFilterState] = useState<{ status?: string; dept?: string; sla?: string; date?: string }>({
    status: "all",
    dept: "all",
    sla: "all",
    date: undefined,
  });

  // Superadmin Database Wipe State
  const [clearMode, setClearMode] = useState<"purge_operational" | "reset_all">("purge_operational");
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [isClearingDb, setIsClearingDb] = useState(false);
  const [clearDbMessage, setClearDbMessage] = useState<string | null>(null);

  const handleClearDatabase = async () => {
    if (clearConfirmText.trim() !== "CONFIRM_CLEAR") {
      alert("Confirmation mismatch: You must type 'CONFIRM_CLEAR' to execute database purge.");
      return;
    }
    if (!confirm("Are you ABSOLUTELY sure? This action cannot be undone.")) {
      return;
    }
    setIsClearingDb(true);
    setClearDbMessage(null);
    try {
      const res: any = await api.clearDatabase({
        mode: clearMode,
        confirm_phrase: "CONFIRM_CLEAR",
      });
      setClearDbMessage(res.message);
      setClearConfirmText("");
      await loadAllData();
      alert(`Success: ${res.message}`);
    } catch (err: any) {
      alert(`Database purge error: ${err.message || err}`);
    } finally {
      setIsClearingDb(false);
    }
  };

  // Check URL query parameters for direct QR scan link & pre-warm cloud backend
  useEffect(() => {
    api.warmup();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get("room");
      if (roomParam) {
        setPatientRoomToken(roomParam);
        setAppMode("patient");
      }
    }
  }, []);

  // 1. Initial Authentication & Load
  const initAuth = useCallback(async () => {
    try {
      const token = getStoredToken();
      if (token) {
        try {
          const me = await api.getMe();
          setCurrentUser(me);
          setAppMode("authenticated");
          if (me.role === "superadmin") {
            setCurrentTab("superadmin-admins");
          } else if (me.role === "staff") {
            setCurrentTab("my-department");
          }
        } catch (_) {
          clearStoredToken();
          setCurrentUser(null);
          setAppMode("gateway");
        }
      } else {
        setAppMode("gateway");
      }
    } catch (err) {
      console.error("Auth init failure:", err);
      setAppMode("gateway");
    }
  }, []);

  // 2. Fetch all operational data
  const loadAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [
        ticketsRes,
        departmentsRes,
        roomsRes,
        policiesRes,
        escalationsRes,
        metricsRes,
        auditRes,
        aiQueueRes,
        simulationRes,
        meRes,
      ] = await Promise.allSettled([
        api.getTickets(),
        api.getDepartments(),
        api.getRooms(),
        api.getSLAPolicies(),
        api.getEscalations(),
        api.getDashboardMetrics(),
        api.getAuditLogs(),
        api.getVerificationQueue(),
        api.getSimulationAccounts(),
        api.getMe(),
      ]);

      if (ticketsRes.status === "fulfilled") setTickets(ticketsRes.value);
      if (departmentsRes.status === "fulfilled") setDepartments(departmentsRes.value);
      if (roomsRes.status === "fulfilled") setRooms(roomsRes.value);
      if (policiesRes.status === "fulfilled") setPolicies(policiesRes.value);
      if (escalationsRes.status === "fulfilled") setEscalations(escalationsRes.value);
      if (metricsRes.status === "fulfilled") setMetrics(metricsRes.value);
      if (auditRes.status === "fulfilled") setAuditLogs(auditRes.value);
      if (aiQueueRes.status === "fulfilled") setAiQueue(aiQueueRes.value);
      if (simulationRes.status === "fulfilled") setSimulationAccounts(simulationRes.value);
      if (meRes.status === "fulfilled" && meRes.value) setCurrentUser(meRes.value);
    } catch (err) {
      console.error("Error refreshing CareOps data:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    initAuth().then(() => {
      loadAllData();
    });
  }, [initAuth, loadAllData]);

  // Periodic subtle background refresh
  useEffect(() => {
    if (appMode !== "authenticated") return;
    const timer = setInterval(() => {
      loadAllData();
    }, 20000);
    return () => clearInterval(timer);
  }, [appMode, loadAllData]);

  // Soft Web Audio Chime Notification for incoming patient requests
  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (_) {}
  }, []);

  // Real-Time Persistent SSE Connection for Staff Workspace
  useEffect(() => {
    if (appMode !== "authenticated") return;
    const token = getStoredToken();
    if (!token) return;

    let sse: EventSource | null = null;
    let reconnectTimer: any = null;

    const connectSSE = () => {
      try {
        const streamUrl = api.getStaffStreamUrl(token);
        sse = new EventSource(streamUrl);

        sse.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            if (payload.event === "ticket_created" && payload.data) {
              const newTicket: Ticket = payload.data;
              setTickets((prev) => {
                if (prev.some((t) => t.id === newTicket.id)) return prev;
                return [newTicket, ...prev];
              });
              // Show toast banner and play soft sound
              setIncomingAlert({
                id: newTicket.id,
                ticket_number: newTicket.ticket_number,
                title: newTicket.title,
                category: newTicket.category,
                room_number: newTicket.room_number,
                department_id: newTicket.department_id,
                time: new Date().toLocaleTimeString(),
              });
              playChime();
            } else if (payload.event === "ticket_updated" && payload.data) {
              const updated: Ticket = payload.data;
              setTickets((prev) =>
                prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
              );
            }
          } catch (_) {}
        };

        sse.onerror = () => {
          if (sse) sse.close();
          // Auto-reconnect after 4 seconds
          reconnectTimer = setTimeout(connectSSE, 4000);
        };
      } catch (_) {}
    };

    connectSSE();

    return () => {
      if (sse) sse.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [appMode, playChime]);

  // Logout / Switch Portal Action
  const handleLogout = () => {
    clearStoredToken();
    setCurrentUser(null);
    setAppMode("gateway");
  };

  // 3. User Role Switcher
  const handleSelectRoleUser = async (email: string) => {
    try {
      const loginRes = await api.login({
        email,
        password: "password123",
      });
      setStoredToken(loginRes.access_token);
      setCurrentUser(loginRes.user);
      if (loginRes.user.role === "superadmin") {
        setCurrentTab("superadmin-admins");
      } else if (loginRes.user.role === "staff") {
        setCurrentTab("my-department");
      } else if (loginRes.user.role === "admin") {
        if (currentTab.startsWith("superadmin-") || currentTab === "my-department") {
          setCurrentTab("overview");
        }
      } else if (loginRes.user.role === "supervisor") {
        if (currentTab.startsWith("superadmin-")) {
          setCurrentTab("my-department");
        }
      }
      loadAllData();
    } catch (err) {
      alert(`Role switch error: ${err}`);
    }
  };

  // RBAC Route Guard: Restrict tabs strictly based on current user role
  useEffect(() => {
    if (!currentUser) return;
    const role = currentUser.role || "admin";
    const staffAllowed = ["my-department", "tickets", "reviews"];
    const supervisorAllowed = ["my-department", "tickets", "ai-verify", "sla", "departments", "analytics", "nps", "reviews"];
    const superAdminAllowed = ["superadmin-admins", "superadmin-security", "superadmin-audit", "superadmin-maintenance"];

    if (role === "superadmin" && !superAdminAllowed.includes(currentTab)) {
      setCurrentTab("superadmin-admins");
    } else if (role === "staff" && !staffAllowed.includes(currentTab)) {
      setCurrentTab("my-department");
    } else if (role === "supervisor" && !supervisorAllowed.includes(currentTab)) {
      setCurrentTab("my-department");
    } else if (role === "admin" && superAdminAllowed.includes(currentTab)) {
      setCurrentTab("overview");
    }
  }, [currentUser, currentTab]);

  // 4. Ticket Actions
  const handleAcknowledge = async (id: number) => {
    try {
      const updated = await api.acknowledgeTicket(id);
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updated, status: "acknowledged" } : t))
      );
      await loadAllData();
    } catch (err: any) {
      alert(`Acknowledgement error: ${err.message}`);
    }
  };

  const handleStartWork = async (id: number) => {
    try {
      const updated = await api.startWork(id);
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updated, status: "in_progress" } : t))
      );
      await loadAllData();
    } catch (err: any) {
      alert(`Start work error: ${err.message}`);
    }
  };

  const handleSubmitResolution = async (
    id: number,
    data: { summary: string; parts?: string; test_notes?: string }
  ) => {
    try {
      await api.submitResolution(id, {
        resolution_summary: data.summary,
        parts_replaced: data.parts,
        functional_test_notes: data.test_notes,
      });
      await loadAllData();
    } catch (err: any) {
      alert(`Resolution submission error: ${err.message}`);
    }
  };

  const handleCloseTicket = async (id: number, approvalNote?: string) => {
    try {
      await api.closeTicket(id, { approval_note: approvalNote, is_approved: true });
      await loadAllData();
    } catch (err: any) {
      alert(`Closure error: ${err.message}`);
    }
  };

  const handleAddNote = async (id: number, content: string, isInternal: boolean) => {
    try {
      await api.addNote(id, { content, is_internal: isInternal });
      await loadAllData();
    } catch (err: any) {
      alert(`Note error: ${err.message}`);
    }
  };

  const handleUploadEvidence = async (
    id: number,
    stage: "before" | "after",
    file: File,
    mediaType: "image" | "video"
  ) => {
    try {
      const formData = new FormData();
      formData.append("ticket_id", String(id));
      formData.append("stage", stage);
      formData.append("media_type", mediaType);
      formData.append("file", file);
      formData.append("notes", `Uploaded by ${currentUser?.name || "staff"}`);

      await api.uploadEvidence(formData);
      await loadAllData();
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    }
  };

  // 5. AI Review Action
  const handleReviewSubmit = async (
    jobId: number,
    decision: string,
    notes?: string,
    overrideReason?: string
  ) => {
    try {
      await api.reviewVerification(jobId, {
        decision,
        notes,
        override_reason: overrideReason,
      });
      await loadAllData();
    } catch (err: any) {
      alert(`Review submission error: ${err.message}`);
    }
  };

  // 6. SLA On-Demand Scan
  const handleRunSLACheck = async () => {
    setIsRunningSLACheck(true);
    try {
      await api.runSLACheckNow();
      await loadAllData();
    } catch (err: any) {
      alert(`SLA scan error: ${err.message}`);
    } finally {
      setIsRunningSLACheck(false);
    }
  };

  // 7. Ticket & Room Creation
  const handleCreateTicket = async (data: any) => {
    try {
      await api.createStaffTicket(data);
      await loadAllData();
    } catch (err: any) {
      alert(`Ticket creation error: ${err.message}`);
    }
  };

  const handleCreateRoom = async (data: any) => {
    try {
      await api.createRoom(data);
      await loadAllData();
    } catch (err: any) {
      alert(`Room creation error: ${err.message}`);
    }
  };

  const activeTicketDetail = tickets.find((t) => t.id === selectedTicketId);

  // GATEWAY VIEW (When not logged in or switching portal)
  if (appMode === "gateway") {
    return (
      <PortalLoginGateway
        onLoginSuccess={(user, landingTab) => {
          setCurrentUser(user);
          setAppMode("authenticated");
          if (landingTab) setCurrentTab(landingTab);
          loadAllData();
        }}
        onEnterPatientPortal={() => {
          setAppMode("patient");
        }}
      />
    );
  }

  // DIRECT PATIENT QR PORTAL VIEW
  if (appMode === "patient") {
    const currentRoomObj = rooms.find((r) => r.qr_token === patientRoomToken) || {
      id: 1,
      room_number: "Room 204",
      floor: "Floor 2",
      wing: "Cardiology East Wing",
      bed_count: 1,
      qr_token: patientRoomToken || "CARE-RM204-7X9Q",
      is_active: true,
    };

    return (
      <div className="min-h-screen bg-[#17212F] flex flex-col items-center justify-center p-2 sm:p-6">
        <div className="w-full max-w-lg mb-3 flex items-center justify-between text-xs text-white/90 px-2 gap-2">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold text-white">Service Point:</span>
            <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white text-[11px] truncate">
              {currentRoomObj.room_number} ({currentRoomObj.wing})
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAppMode("gateway")}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors text-xs"
            >
              ← Staff Login
            </button>
          </div>
        </div>

        <div className="w-full max-w-lg h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden relative flex flex-col">
          <PatientPortal
            initialRoomToken={patientRoomToken}
            allRooms={rooms}
            onClose={() => setAppMode("gateway")}
            currentUser={currentUser}
          />
        </div>

        {showDirectQRPlacard && (
          <RoomQRPlacardModal
            room={{
              room_number: currentRoomObj.room_number,
              floor: currentRoomObj.floor,
              wing: currentRoomObj.wing,
              qr_token: currentRoomObj.qr_token,
            }}
            allRooms={rooms}
            onSelectRoom={(r) => {
              setPatientRoomToken(r.qr_token);
            }}
            onClose={() => setShowDirectQRPlacard(false)}
          />
        )}
      </div>
    );
  }

  // AUTHENTICATED STAFF & ADMIN OPERATIONAL INTERFACE
  return (
    <div className="min-h-screen bg-[#F7F8FA] flex">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        currentUser={currentUser}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        onOpenPatientPortal={() => setShowPatientPortal(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Pane */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ml-0 ${
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        <Header
          currentTab={currentTab}
          currentUser={currentUser}
          simulationAccounts={simulationAccounts}
          onSelectRoleUser={handleSelectRoleUser}
          onOpenCreateModal={() => setShowCreateModal(true)}
          onSearch={(q) => console.log("Search query:", q)}
          onRefreshData={loadAllData}
          isRefreshing={isRefreshing}
          onLogout={handleLogout}
          onSelectTicket={(id) => setSelectedTicketId(id)}
          onNavigateTab={(tab) => setCurrentTab(tab)}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Real-Time Incoming Patient Complaint Toast Banner */}
        {incomingAlert && (
          <div className="mx-6 mt-4 p-4 rounded-3xl bg-gradient-to-r from-[#176B63] to-[#0D544C] text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300 border-2 border-[#A7D7D1]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-white/20 shrink-0 shadow-inner">
                <Bell className="h-6 w-6 text-white animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                    ● Real-Time Patient Complaint
                  </span>
                  <span className="text-xs font-mono text-white/80">{incomingAlert.time}</span>
                </div>
                <h4 className="text-base font-black mt-0.5 text-white">
                  {incomingAlert.category} Issue — {incomingAlert.room_number} (Ref: {incomingAlert.ticket_number})
                </h4>
                <p className="text-xs text-white/80 line-clamp-1">{incomingAlert.title}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  handleAcknowledge(incomingAlert.id);
                  setIncomingAlert(null);
                }}
                className="px-4 py-2 rounded-xl bg-white text-[#176B63] hover:bg-[#F1F5F9] text-xs font-black transition-all shadow-sm cursor-pointer whitespace-nowrap"
              >
                ✓ Acknowledge Now
              </button>
              <button
                onClick={() => {
                  setSelectedTicketId(incomingAlert.id);
                  setCurrentTab("my-department");
                  setIncomingAlert(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
              >
                View Details
              </button>
              <button
                onClick={() => setIncomingAlert(null)}
                className="p-2 text-white/70 hover:text-white cursor-pointer"
                title="Dismiss banner"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 pb-16">
          {/* SUPER ADMIN DEDICATED VIEWS (Strictly isolated from operational screens) */}
          {currentTab === "superadmin-admins" && <AdminManagementView />}
          {currentTab === "superadmin-security" && <SystemSecurityView />}
          {currentTab === "superadmin-audit" && <SuperAdminAuditView />}
          {currentTab === "superadmin-maintenance" && (
            <DatabaseMaintenanceView onPurgeSuccess={loadAllData} />
          )}

          {/* DEDICATED NPS MODULE (Separated from Google Reviews) */}
          {currentTab === "nps" && <NPSModuleView currentUser={currentUser} />}

          {currentTab === "overview" && (
            <OverviewDashboard
              metrics={metrics}
              currentUser={currentUser}
              onSelectTicket={(id) => setSelectedTicketId(id)}
              onViewAllTickets={(filterStatus, deptId, slaFilter, dateFilter) => {
                setTicketFilterState({
                  status: filterStatus || "all",
                  dept: deptId || "all",
                  sla: slaFilter || "all",
                  date: dateFilter || undefined,
                });
                setCurrentTab("tickets");
              }}
              onViewAIVerification={() => setCurrentTab("ai-verify")}
              onNavigateTab={(tab) => setCurrentTab(tab)}
              onOpenCreateTicket={() => setShowCreateModal(true)}
              onRunSLACheck={handleRunSLACheck}
              isRunningSLACheck={isRunningSLACheck}
            />
          )}

          {currentTab === "tickets" && (
            <TicketTable
              tickets={tickets}
              departments={departments}
              currentUser={currentUser}
              onSelectTicket={(id) => setSelectedTicketId(id)}
              onOpenCreateModal={() => setShowCreateModal(true)}
              initialStatusFilter={ticketFilterState.status}
              initialDeptFilter={ticketFilterState.dept}
              initialSlaFilter={ticketFilterState.sla}
              initialDateFilter={ticketFilterState.date}
            />
          )}

          {currentTab === "my-department" && (
            <StaffWorkspace
              tickets={tickets}
              currentUser={currentUser}
              onSelectTicket={(id) => setSelectedTicketId(id)}
              onAcknowledge={handleAcknowledge}
              onStartWork={handleStartWork}
            />
          )}

          {currentTab === "ai-verify" && (
            <AIVerificationCenter
              queue={aiQueue}
              currentUser={currentUser}
              onReviewSubmit={handleReviewSubmit}
              onSelectTicket={(id) => setSelectedTicketId(id)}
              onRefreshQueue={loadAllData}
            />
          )}

          {currentTab === "sla" && (
            <SLAPoliciesView
              policies={policies}
              escalations={escalations}
              onRunSLACheck={handleRunSLACheck}
              isRunningCheck={isRunningSLACheck}
              onSelectTicket={(id) => setSelectedTicketId(id)}
            />
          )}

          {currentTab === "departments" && (
            <StaffAccessManagementView
              departments={departments}
              currentUser={currentUser}
              onStaffUpdated={loadAllData}
            />
          )}

          {currentTab === "patient-accounts" && <PatientAccountsView />}

          {currentTab === "emails" && <EmailDeliveryManager />}

          {currentTab === "rooms" && (
            <QRRoomManager
              rooms={rooms}
              currentUser={currentUser}
              onCreateRoom={handleCreateRoom}
              onLaunchPatientQR={(token) => {
                setPatientRoomToken(token);
                setShowPatientPortal(true);
              }}
            />
          )}

          {currentTab === "analytics" && (
            <AnalyticsReportsView
              metrics={metrics}
              tickets={tickets}
              departments={departments}
              onSelectTicket={(id) => setSelectedTicketId(id)}
            />
          )}

          {currentTab === "audit" && <AuditLogsView logs={auditLogs} />}

          {currentTab === "reviews" && (
            <ReviewsModuleView currentUser={currentUser} />
          )}

          {currentTab === "settings" && (
            <div className="p-8 max-w-4xl mx-auto space-y-6">
              <div>
                <h1 className="text-xl font-bold text-[#17212F]">System Controls & AI Settings</h1>
                <p className="text-xs text-[#667085]">
                  Model parameters, storage configurations, and operational tolerances
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-[#E5E9EF] shadow-xs space-y-4 text-xs">
                <h3 className="font-bold text-sm text-[#17212F]">AI Verification Model Configuration</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[#667085] block mb-1">Model Version</label>
                    <input
                      readOnly
                      value="careops-vision-v2.4 (Multimodal Heuristic Frame Analyzer)"
                      className="w-full p-2 bg-[#F7F8FA] border border-[#E5E9EF] rounded-lg font-mono text-[#17212F]"
                    />
                  </div>
                  <div>
                    <label className="text-[#667085] block mb-1">Auto-Confirm Confidence Threshold</label>
                    <input
                      readOnly
                      value="0.85 (85% required)"
                      className="w-full p-2 bg-[#F7F8FA] border border-[#E5E9EF] rounded-lg font-mono text-[#17212F]"
                    />
                  </div>
                </div>
                <div className="p-3 bg-[#EEF4FD] rounded-xl text-[#3868C9] border border-[#BFDBFE]">
                  <strong>Clinical Safety Enforced:</strong> Critical priority tickets and dynamic appliances (e.g. ceiling fans, pumps) strictly require video frame motion verification or mandatory human sign-off before closure.
                </div>
              </div>

              {/* Superadmin Database Controls vs Locked Security Notice */}
              {currentUser?.role === "superadmin" ? (
                <div className="bg-white p-6 rounded-2xl border-2 border-[#176B63] shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-[#E8F3F1] text-[#176B63]">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-[#0F172A]">Superadmin Database Maintenance Suite</h3>
                        <p className="text-xs text-[#64748B]">
                          Access selective category clearing, impact preview, and durable audit logs.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setCurrentTab("superadmin-maintenance")}
                      className="px-4 py-2 bg-[#176B63] text-white rounded-xl text-xs font-bold hover:bg-[#10574F] transition-all cursor-pointer"
                    >
                      Open Database Maintenance
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border-2 border-[#E5E9EF] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-[#F1F5F9] text-[#64748B]">
                        <Lock className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-[#0F172A]">Database Purge & Factory Reset</h3>
                        <p className="text-xs text-[#64748B]">
                          Permanent data clearance & table wipe controls
                        </p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#FEF2F2] text-[#DC2626] border border-[#FCA5A5] font-black text-xs uppercase tracking-wider">
                      🔒 Superadmin Clearance Required
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#475467] leading-relaxed">
                    <strong>Access Restricted:</strong> You are signed in as <strong>{currentUser?.name || "Administrator"}</strong> ({currentUser?.role}). Only the authenticated <strong>System Superadmin</strong> (<code>superadmin@careops.hospital</code>) has authorization to execute database purges. Standard hospital administrators cannot view or run destructive operations.
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Ticket Details Drawer / Modal */}
      {activeTicketDetail && (
        <TicketDetailView
          ticket={activeTicketDetail}
          currentUser={currentUser}
          onClose={() => setSelectedTicketId(null)}
          onAcknowledge={handleAcknowledge}
          onStartWork={handleStartWork}
          onSubmitResolution={handleSubmitResolution}
          onCloseTicket={handleCloseTicket}
          onAddNote={handleAddNote}
          onUploadEvidence={handleUploadEvidence}
          onTicketUpdated={loadAllData}
        />
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <CreateTicketModal
          departments={departments}
          rooms={rooms}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateTicket}
        />
      )}

      {/* Patient QR Portal Overlay Simulation */}
      {showPatientPortal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden relative flex flex-col">
            <PatientPortal
              initialRoomToken={patientRoomToken}
              allRooms={rooms}
              onClose={() => setShowPatientPortal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
