"use client";

import React, { useState } from "react";
import {
  Search,
  Bell,
  Plus,
  Shield,
  Activity,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  RefreshCw,
  KeyRound,
  User as UserIcon,
  Menu
} from "lucide-react";
import { User, SimulationAccount, api } from "@/lib/api";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { NotificationBellDropdown } from "@/components/notifications/NotificationBellDropdown";

interface HeaderProps {
  currentTab: string;
  currentUser: User | null;
  simulationAccounts?: SimulationAccount[];
  onSelectRoleUser: (email: string) => void;
  onOpenCreateModal: () => void;
  onOpenEditProfile?: () => void;
  onSearch: (query: string) => void;
  onRefreshData: () => void;
  isRefreshing?: boolean;
  onLogout: () => void;
  onSelectTicket?: (ticketId: number) => void;
  onNavigateTab?: (tab: string) => void;
  onToggleSidebar?: () => void;
}

export function Header({
  currentTab,
  currentUser,
  simulationAccounts,
  onSelectRoleUser,
  onOpenCreateModal,
  onOpenEditProfile,
  onSearch,
  onRefreshData,
  isRefreshing = false,
  onLogout,
  onSelectTicket,
  onNavigateTab,
  onToggleSidebar,
}: HeaderProps) {
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [liveAccounts, setLiveAccounts] = useState<SimulationAccount[]>([]);

  const fetchLiveSimulationAccounts = async () => {
    try {
      const data = await api.getSimulationAccounts();
      if (Array.isArray(data) && data.length > 0) {
        setLiveAccounts(data);
      }
    } catch (_) {}
  };

  React.useEffect(() => {
    if (simulationAccounts && simulationAccounts.length > 0) {
      setLiveAccounts(simulationAccounts);
    } else {
      fetchLiveSimulationAccounts();
    }
  }, [simulationAccounts]);

  const breadcrumbsMap: Record<string, string> = {
    overview: "Command Center / Operations Overview",
    tickets: "Service Tickets / Global Register",
    "my-department": "Staff Workspace / Operational Queue",
    "ai-verify": "AI Verification Center / Evidence Diagnostics",
    sla: "Escalation",
    reviews: "Reputation & Patient Experience",
    departments: "Organization / Department & Staff Directory",
    rooms: "Facilities / QR Room Point Management",
    audit: "Compliance / Immutable Audit Logs",
    settings: "System Controls & AI Model Configuration",
  };

  const fallbackAccounts: SimulationAccount[] = [
    {
      name: "System Superadmin",
      role: "Superadmin (Root)",
      badge: "SUPERADMIN",
      email: "superadmin@careops.hospital",
      desc: "Database purge & root platform authority",
    },
    {
      name: "Hospital Administrator",
      role: "Administrator",
      badge: "ADMINISTRATOR",
      email: "admin@careops.hospital",
      desc: "Full hospital controls & policies",
    },
    {
      name: "Maintenance Supervisor",
      role: "Supervisor",
      badge: "MAINTENANCE",
      email: "supervisor.mnt@careops.hospital",
      desc: "AI review sign-offs & SLA escalations",
    },
    {
      name: "Maintenance Specialist",
      role: "Staff",
      badge: "MAINTENANCE",
      email: "technician.rajesh@careops.hospital",
      desc: "Acknowledge, capture evidence & resolve",
    },
    {
      name: "Staff Nurse",
      role: "Staff",
      badge: "MEDICAL",
      email: "nurse.priya@careops.hospital",
      desc: "Clinical & IV requests",
    },
  ];

  const sourceAccounts = liveAccounts.length > 0 ? liveAccounts : (simulationAccounts && simulationAccounts.length > 0 ? simulationAccounts : fallbackAccounts);

  const hasCurrentUser = sourceAccounts.some(
    (acc) => acc.email?.toLowerCase() === currentUser?.email?.toLowerCase()
  );

  const mergedAccounts = [...sourceAccounts];
  if (currentUser && !hasCurrentUser && currentUser.email) {
    const deptBadge = currentUser.department_id ? currentUser.department_id.toUpperCase() : currentUser.role?.toUpperCase();
    mergedAccounts.unshift({
      id: currentUser.id,
      name: currentUser.name || "Hospital User",
      email: currentUser.email,
      role: currentUser.role || "staff",
      badge: deptBadge || "ACTIVE",
      employee_id: currentUser.employee_id,
      department_id: currentUser.department_id,
      designation: currentUser.designation,
      desc: currentUser.designation || (currentUser.department_id ? `${currentUser.department_id.toUpperCase()} ${currentUser.role}` : currentUser.role),
    });
  }

  const displayAccounts = mergedAccounts
    .filter((acc) => {
      // If current user is not superadmin, System Superadmin won't show for admin
      if (currentUser?.role !== "superadmin") {
        const isSuperadmin =
          acc.role === "superadmin" ||
          acc.role === "Superadmin (Root)" ||
          acc.badge === "SUPERADMIN" ||
          acc.email?.toLowerCase().includes("superadmin") ||
          acc.name?.toLowerCase().includes("superadmin");
        if (isSuperadmin) return false;
      }
      return true;
    })
    .map((acc) => {
    if (currentUser && currentUser.email?.toLowerCase() === acc.email?.toLowerCase()) {
      return {
        ...acc,
        name: currentUser.name || acc.name,
        desc: currentUser.designation || acc.desc,
        badge: currentUser.department_id ? currentUser.department_id.toUpperCase() : acc.badge || acc.role,
      };
    }
    return acc;
  });

  return (
    <header className="h-15 glass-header sticky top-0 z-20 flex items-center justify-between px-5 sm:px-6">
      {/* Breadcrumb & Mobile Menu Toggle */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="md:hidden p-1.5 -ml-1 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Toggle navigation"
          title="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm sm:text-base font-extrabold text-[#0F172A] tracking-tight truncate max-w-[180px] sm:max-w-none">
          {breadcrumbsMap[currentTab] || "Operations Dashboard"}
        </span>
      </div>

      {/* Global Actions */}
      <div className="flex items-center gap-2.5">
        {/* Search */}
        <div className="relative hidden lg:block w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
          <input
            type="text"
            placeholder="Search tickets, rooms, faults..."
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-white/70 text-xs font-semibold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white transition-all placeholder-[#64748B]"
          />
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefreshData}
          disabled={isRefreshing}
          className="p-2 rounded-lg text-[#475569] hover:text-[#0F172A] hover:bg-black/5 transition-colors cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className={`h-4.5 w-4.5 ${isRefreshing ? "animate-spin text-[#176B63]" : ""}`} />
        </button>

        {/* Role-Aware Dynamic In-App Notifications */}
        <NotificationBellDropdown
          onSelectTicket={onSelectTicket}
          onNavigateTab={onNavigateTab}
        />

        {/* Fast Role Switcher */}
        <div className="relative">
          <button
            onClick={() => {
              const nextState = !showRoleMenu;
              setShowRoleMenu(nextState);
              if (nextState) {
                fetchLiveSimulationAccounts();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-xs font-bold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
          >
            <UserCheck className="h-3.5 w-3.5 text-[#176B63]" />
            <span className="hidden sm:inline">Role:</span>
            <span
              className={`font-black capitalize ${
                currentUser?.role === "superadmin" ? "text-[#DC2626]" : "text-[#176B63]"
              }`}
            >
              {currentUser?.role === "superadmin" ? "Superadmin (Root)" : currentUser?.role || "Admin"}
            </span>
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-[#CBD5E1] p-2.5 text-xs z-50">
              <div className="px-2 py-1 text-[10px] font-bold text-[#475569] uppercase tracking-wider">
                Simulate Role Workspace
              </div>
              <div className="space-y-1 mt-1">
                {displayAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    onClick={() => {
                      onSelectRoleUser(acc.email);
                      setShowRoleMenu(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg transition-colors flex flex-col ${
                      currentUser?.email?.toLowerCase() === acc.email.toLowerCase()
                        ? "bg-[#E8F3F1] text-[#176B63] ring-1 ring-[#176B63]"
                        : "hover:bg-[#F1F5F9] text-[#0F172A]"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span className="truncate pr-2">{acc.name}</span>
                      <span className="text-[10px] uppercase font-bold text-[#475569] shrink-0">
                        {acc.badge || acc.role.split(" ")[0]}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#475569] font-normal mt-0.5 line-clamp-1">{acc.desc}</span>
                  </button>
                ))}

                <div className="pt-1.5 border-t border-[#E2E8F0] mt-1 space-y-1">
                  <button
                    onClick={() => {
                      setShowRoleMenu(false);
                      if (onOpenEditProfile) onOpenEditProfile();
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-slate-100 text-slate-800 font-bold flex items-center justify-between transition-colors cursor-pointer text-xs"
                  >
                    <span>Edit My Profile</span>
                    <UserIcon className="h-3.5 w-3.5 text-[#176B63]" />
                  </button>

                  <button
                    onClick={() => {
                      setShowRoleMenu(false);
                      setShowChangePassword(true);
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-slate-100 text-slate-800 font-bold flex items-center justify-between transition-colors cursor-pointer text-xs"
                  >
                    <span>Change My Password</span>
                    <KeyRound className="h-3.5 w-3.5 text-[#176B63]" />
                  </button>

                  <button
                    onClick={() => {
                      setShowRoleMenu(false);
                      onLogout();
                    }}
                    className="w-full text-left p-2 rounded-lg hover:bg-[#FEE2E2] text-[#DC2626] font-bold flex items-center justify-between transition-colors cursor-pointer text-xs"
                  >
                    <span>Switch Portal / Log Out</span>
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create Ticket Action */}
        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#176B63] hover:bg-[#10574F] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Ticket</span>
        </button>
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePassword}
        onClose={() => setShowChangePassword(false)}
        userRole={currentUser?.role}
      />
    </header>
  );
}
