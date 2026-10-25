"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  UserX,
  UserCheck,
  Building,
  X,
  Search,
  Filter,
  RefreshCw,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  Sparkles,
  HeartPulse,
  Wrench,
  Stethoscope,
  Receipt,
  Pill,
  Trash2,
  Pencil,
  Plus,
  Power
} from "lucide-react";
import { Department, StaffMember, StaffMetrics, User as UserType, api, formatDateTime } from "@/lib/api";
import { StaffDetailDrawer } from "@/components/StaffDetailDrawer";
import { CreateStaffModal } from "@/components/CreateStaffModal";
import { RolesManagementModal } from "@/components/RolesManagementModal";
import { SecurityEventsModal } from "@/components/SecurityEventsModal";
import { DepartmentAnalyticsModal } from "@/components/departments/DepartmentAnalyticsModal";
import { DepartmentManageModal } from "@/components/departments/DepartmentManageModal";
import { DepartmentDeleteModal } from "@/components/departments/DepartmentDeleteModal";
import { PermissionMatrixModal } from "@/components/common/PermissionMatrixModal";

interface StaffAccessManagementViewProps {
  departments: Department[];
  currentUser: UserType | null;
  onStaffUpdated?: () => void;
}

export function StaffAccessManagementView({
  departments,
  currentUser,
  onStaffUpdated,
}: StaffAccessManagementViewProps) {
  // Navigation Section
  const [activeViewMode, setActiveViewMode] = useState<"directory" | "departments">("directory");
  const [selectedAnalyticsDeptId, setSelectedAnalyticsDeptId] = useState<string | null>(null);
  const [permissionTargetUser, setPermissionTargetUser] = useState<StaffMember | null>(null);

  // Department Management State
  const [deptList, setDeptList] = useState<Department[]>(departments || []);
  const [includeInactiveDepts, setIncludeInactiveDepts] = useState(false);
  const [showDeptManageModal, setShowDeptManageModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null);
  const [showDeptDeleteModal, setShowDeptDeleteModal] = useState(false);

  useEffect(() => {
    if (departments && departments.length > 0) {
      setDeptList(departments);
    }
  }, [departments]);

  const loadDepartments = async () => {
    try {
      const res = await api.getDepartments(includeInactiveDepts);
      if (Array.isArray(res)) {
        setDeptList(res);
      }
    } catch (err) {
      console.error("Failed to load departments:", err);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, [includeInactiveDepts]);

  const handleToggleDeptStatus = async (dept: Department, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.toggleDepartmentStatus(dept.id, !dept.is_active);
      await loadDepartments();
    } catch (err: any) {
      alert(err?.message || "Failed to toggle department status");
    }
  };

  // Directory State
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [metrics, setMetrics] = useState<StaffMetrics>({
    total_staff: 0,
    active_accounts: 0,
    inactive_accounts: 0,
    locked_accounts: 0,
    pending_activation: 0,
  });
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  // Drawers & Modals
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  // Sensitive Action Confirmation State
  const [actionTargetStaff, setActionTargetStaff] = useState<StaffMember | null>(null);
  const [actionType, setActionType] = useState<"unlock" | "deactivate" | "reset_password" | "delete" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [generatedTempPw, setGeneratedTempPw] = useState<string | null>(null);

  useEffect(() => {
    loadStaffDirectory();
  }, [page, pageSize, selectedDept, selectedRole, selectedStatus]);

  // Debounced Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadStaffDirectory();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadStaffDirectory = async () => {
    setIsLoading(true);
    try {
      const data = await api.getStaffList({
        search: searchTerm || undefined,
        department_id: selectedDept !== "all" ? selectedDept : undefined,
        role: selectedRole !== "all" ? selectedRole : undefined,
        account_status: selectedStatus !== "all" ? selectedStatus : undefined,
        page,
        page_size: pageSize,
      });

      const items = (data.items || []).filter(
        (member: StaffMember) => currentUser?.role === "superadmin" || member.role !== "superadmin"
      );
      setStaffList(items);
      setMetrics(data.metrics);
      setTotalItems(data.total);
      setTotalPages(data.total_pages);
      onStaffUpdated?.();
    } catch (err) {
      console.error("Failed to load staff list", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (staffList.length === 0) return;
    const headers = ["Employee ID", "Full Name", "Email", "Department", "Designation", "Role", "Status", "Last Login"];
    const rows = staffList.map((s) => [
      `"${s.employee_id}"`,
      `"${s.name}"`,
      `"${s.email}"`,
      `"${s.department_name || s.department_id || "Global"}"`,
      `"${s.designation}"`,
      `"${s.role}"`,
      `"${s.account_status}"`,
      `"${s.last_login_at ? new Date(s.last_login_at).toISOString() : "Never"}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `CareOps_Hospital_Staff_Directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Action Triggers
  const triggerUnlock = (staff: StaffMember) => {
    setActionTargetStaff(staff);
    setActionType("unlock");
    setActionReason("Staff identity verified in-person at hospital administration office.");
    setGeneratedTempPw(null);
  };

  const triggerDeactivate = (staff: StaffMember) => {
    setActionTargetStaff(staff);
    setActionType("deactivate");
    setActionReason("Personnel marked inactive by administrator.");
    setGeneratedTempPw(null);
  };

  const triggerDelete = (staff: StaffMember) => {
    setActionTargetStaff(staff);
    setActionType("delete");
    setActionReason("Staff record permanently removed by Superadmin.");
    setGeneratedTempPw(null);
  };

  const triggerResetPassword = (staff: StaffMember) => {
    setActionTargetStaff(staff);
    setActionType("reset_password");
    setActionReason("");
    setGeneratedTempPw(null);
  };

  const handleActivateAccount = async (staff: StaffMember) => {
    try {
      await api.activateStaff(staff.id);
      setActionSuccessMessage(`Account for ${staff.name} has been activated successfully.`);
      setTimeout(() => setActionSuccessMessage(null), 4000);
      loadStaffDirectory();
      if (selectedStaff?.id === staff.id) {
        setSelectedStaff({ ...staff, account_status: "active", is_active: true });
      }
    } catch (err: any) {
      alert(`Activation error: ${err.message}`);
    }
  };

  const executeSensitiveAction = async () => {
    if (!actionTargetStaff || !actionType) return;
    setIsSubmittingAction(true);

    try {
      if (actionType === "unlock") {
        await api.unlockStaff(actionTargetStaff.id, actionReason.trim());
        setActionSuccessMessage(`Account ${actionTargetStaff.employee_id} (${actionTargetStaff.name}) unlocked successfully.`);
        setActionType(null);
      } else if (actionType === "deactivate") {
        await api.deactivateStaff(actionTargetStaff.id, actionReason.trim());
        setActionSuccessMessage(`Account ${actionTargetStaff.employee_id} (${actionTargetStaff.name}) has been marked inactive.`);
        setActionType(null);
      } else if (actionType === "delete") {
        await api.deleteStaff(actionTargetStaff.id);
        setActionSuccessMessage(`Staff member ${actionTargetStaff.name} has been permanently deleted by Superadmin.`);
        setActionType(null);
        if (selectedStaff?.id === actionTargetStaff.id) {
          setSelectedStaff(null);
        }
      } else if (actionType === "reset_password") {
        const res = await api.resetStaffPassword(actionTargetStaff.id, { require_change: true });
        setGeneratedTempPw(res.temporary_password);
        setActionSuccessMessage(`Temporary password generated for ${actionTargetStaff.name}.`);
      }

      await loadStaffDirectory();
      if (selectedStaff?.id === actionTargetStaff.id) {
        const updated = await api.getStaffDetail(actionTargetStaff.id);
        setSelectedStaff(updated);
      }
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setIsSubmittingAction(false);
      setTimeout(() => setActionSuccessMessage(null), 5000);
    }
  };

  const getDepartmentIcon = (iconName: string) => {
    switch (iconName) {
      case "Wrench":
        return <Wrench className="h-5 w-5 text-[#176B63]" />;
      case "Stethoscope":
        return <Stethoscope className="h-5 w-5 text-[#3868C9]" />;
      case "HeartPulse":
        return <HeartPulse className="h-5 w-5 text-[#C43D4B]" />;
      case "Sparkles":
        return <Sparkles className="h-5 w-5 text-[#B7791F]" />;
      case "Receipt":
        return <Receipt className="h-5 w-5 text-[#16805D]" />;
      case "Pill":
        return <Pill className="h-5 w-5 text-[#8B5CF6]" />;
      default:
        return <Building className="h-5 w-5 text-[#176B63]" />;
    }
  };

  const getRoleBadge = (role: string) => {
    const config: Record<string, { label: string; style: string }> = {
      admin: { label: "Super Admin", style: "bg-[#E8F3F1] text-[#176B63] border-[#99F6E4]" },
      it_admin: { label: "IT Administrator", style: "bg-[#EEF4FD] text-[#3868C9] border-[#BFDBFE]" },
      supervisor: { label: "Supervisor", style: "bg-[#FEF7EC] text-[#B7791F] border-[#FAD7A0]" },
      doctor: { label: "Physician", style: "bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]" },
      nurse: { label: "Clinical Nurse", style: "bg-[#FDF2F2] text-[#C43D4B] border-[#F8D7DA]" },
      staff: { label: "Facilities Lead", style: "bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]" },
      housekeeping: { label: "Housekeeping", style: "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]" },
      billing: { label: "Billing Officer", style: "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]" },
      pharmacy: { label: "Pharmacist", style: "bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]" },
      auditor: { label: "Auditor", style: "bg-[#F3F4F6] text-[#374151] border-[#D1D5DB]" },
    };

    const c = config[role] || { label: role.toUpperCase(), style: "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]" };

    return (
      <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border-2 ${c.style}`}>
        {c.label}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#EDF7F2] text-[#16805D] border-2 border-[#A6E1CE]">
            <span className="h-2 w-2 rounded-full bg-[#16805D]" />
            Active
          </span>
        );
      case "locked":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#FEE2E2] text-[#991B1B] border-2 border-[#FCA5A5] animate-pulse">
            <Lock className="h-3.5 w-3.5" />
            Locked
          </span>
        );
      case "inactive":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#F1F5F9] text-[#475569] border-2 border-[#CBD5E1]">
            <UserX className="h-3.5 w-3.5" />
            Inactive
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#FEF3C7] text-[#92400E] border-2 border-[#FCD34D]">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="p-5 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* 1. Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#176B63] text-white shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                Staff & Access Management
              </h1>
              <p className="text-xs sm:text-sm text-[#475569] mt-0.5 font-medium">
                Manage hospital personnel, roles, account security, and departmental access.
              </p>
            </div>
          </div>
        </div>

        {/* Global Header Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Export Directory to CSV"
          >
            <Download className="h-3.5 w-3.5 text-[#475569]" />
            <span>Export Staff</span>
          </button>

          <button
            onClick={() => setShowRolesModal(true)}
            className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Inspect Hospital Roles & Granular Permissions"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-[#176B63]" />
            <span>Manage Roles</span>
          </button>

          <button
            onClick={() => setShowSecurityModal(true)}
            className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="View Security Telemetry & Lockout Logs"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-[#DC2626]" />
            <span>Security Events</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-[#176B63] hover:bg-[#10574F] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>+ Create Staff</span>
          </button>
        </div>
      </div>

      {/* Global Success Notification Toast */}
      {actionSuccessMessage && (
        <div className="p-4 rounded-2xl bg-[#EDF7F2] border-2 border-[#A6E1CE] text-sm font-black text-[#16805D] flex items-center gap-3 shadow-sm animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* 2. Live Summary Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4.5">
        <div className="bg-white p-5.5 rounded-3xl border-2 border-[#CBD5E1] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-[#475569] block">
              Total Hospital Staff
            </span>
            <div className="text-3xl font-black text-[#0F172A] mt-1 tabular-nums">
              {metrics.total_staff}
            </div>
            <span className="text-xs font-bold text-[#176B63] mt-0.5 block">
              Configured Personnel
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#E8F3F1] text-[#176B63]">
            <Users className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5.5 rounded-3xl border-2 border-[#CBD5E1] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-[#475569] block">
              Active Accounts
            </span>
            <div className="text-3xl font-black text-[#16805D] mt-1 tabular-nums">
              {metrics.active_accounts}
            </div>
            <span className="text-xs font-bold text-[#16805D] mt-0.5 block">
              Eligible to Authenticate
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#EDF7F2] text-[#16805D]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5.5 rounded-3xl border-2 border-[#CBD5E1] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-[#475569] block">
              Inactive Accounts
            </span>
            <div className="text-3xl font-black text-[#475569] mt-1 tabular-nums">
              {metrics.inactive_accounts}
            </div>
            <span className="text-xs font-bold text-[#64748B] mt-0.5 block">
              Deactivated / On Leave
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#F1F5F9] text-[#64748B]">
            <UserX className="h-6 w-6" />
          </div>
        </div>

        <div
          className={`p-5.5 rounded-3xl border-2 shadow-sm flex items-center justify-between transition-all ${
            metrics.locked_accounts > 0
              ? "bg-[#FEF2F2] border-[#FCA5A5]"
              : "bg-white border-[#CBD5E1]"
          }`}
        >
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-[#475569] block">
              Locked Accounts
            </span>
            <div
              className={`text-3xl font-black mt-1 tabular-nums ${
                metrics.locked_accounts > 0 ? "text-[#DC2626]" : "text-[#0F172A]"
              }`}
            >
              {metrics.locked_accounts}
            </div>
            <span
              className={`text-xs font-bold mt-0.5 block ${
                metrics.locked_accounts > 0 ? "text-[#991B1B]" : "text-[#16805D]"
              }`}
            >
              {metrics.locked_accounts > 0
                ? "3 Failed Attempts Lockout"
                : "No Locked Accounts"}
            </span>
          </div>
          <div
            className={`p-3.5 rounded-2xl ${
              metrics.locked_accounts > 0
                ? "bg-[#FEE2E2] text-[#DC2626] animate-pulse"
                : "bg-[#F1F5F9] text-[#64748B]"
            }`}
          >
            <Lock className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 3. Section Switcher Tabs */}
      <div className="flex items-center gap-3 border-b-2 border-[#CBD5E1] pb-1">
        <button
          onClick={() => setActiveViewMode("directory")}
          className={`py-3 px-5 rounded-2xl font-black text-sm transition-all cursor-pointer flex items-center gap-2 ${
            activeViewMode === "directory"
              ? "bg-[#0F172A] text-white shadow-md"
              : "bg-white text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] border-2 border-[#CBD5E1]"
          }`}
        >
          <Users className="h-4.5 w-4.5" />
          <span>Staff Directory & Access Roster</span>
        </button>

        <button
          onClick={() => setActiveViewMode("departments")}
          className={`py-3 px-5 rounded-2xl font-black text-sm transition-all cursor-pointer flex items-center gap-2 ${
            activeViewMode === "departments"
              ? "bg-[#0F172A] text-white shadow-md"
              : "bg-white text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] border-2 border-[#CBD5E1]"
          }`}
        >
          <Building2 className="h-4.5 w-4.5" />
          <span>Hospital Service Departments ({deptList.length})</span>
        </button>
      </div>

      {/* 4. MODE A: STAFF DIRECTORY */}
      {activeViewMode === "directory" && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-4.5 shadow-sm space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              {/* Search */}
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-[#64748B]" />
                <input
                  type="text"
                  placeholder="Search by name, employee ID, email, role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-semibold text-[#0F172A] focus:outline-none focus:border-[#176B63] focus:bg-white placeholder-[#64748B]"
                />
              </div>

              {/* Department Filter */}
              <div>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63]"
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Role Filter */}
              <div>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63]"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Super Admin</option>
                  <option value="it_admin">IT Administrator</option>
                  <option value="supervisor">Department Head</option>
                  <option value="doctor">Physician / Doctor</option>
                  <option value="nurse">Clinical Nurse</option>
                  <option value="staff">Facilities Lead</option>
                  <option value="housekeeping">Housekeeping</option>
                  <option value="billing">Billing Officer</option>
                  <option value="pharmacy">Pharmacist</option>
                  <option value="auditor">Auditor</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border-2 border-[#CBD5E1] bg-[#F8FAFC] text-sm font-bold text-[#0F172A] focus:outline-none focus:border-[#176B63]"
                >
                  <option value="all">All Account Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="locked">Locked Only (Failed Logins)</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-3xl border-2 border-[#94A3B8] shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#E2E8F0] border-b-2 border-[#94A3B8] text-sm font-black text-[#0F172A] uppercase tracking-wider">
                    <th className="py-4 px-5">Staff Member</th>
                    <th className="py-4 px-5">Employee ID</th>
                    <th className="py-4 px-5">Department</th>
                    <th className="py-4 px-5">Designation</th>
                    <th className="py-4 px-5">Assigned Role</th>
                    <th className="py-4 px-5">Account Status</th>
                    <th className="py-4 px-5">Last Login</th>
                    <th className="py-4 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-[#E2E8F0] text-sm font-bold text-[#0F172A]">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-14 text-center text-[#64748B]">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[#176B63]" />
                        <span>Loading hospital staff directory...</span>
                      </td>
                    </tr>
                  ) : staffList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-14 text-center text-[#475569]">
                        <Users className="h-8 w-8 mx-auto mb-2 text-[#94A3B8]" />
                        <div className="font-black text-base text-[#0F172A]">No matching staff members found</div>
                        <p className="text-xs text-[#64748B] mt-1">
                          Try adjusting search filters or provision a new staff account.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    staffList.map((staff) => (
                      <tr
                        key={staff.id}
                        onClick={() => setSelectedStaff(staff)}
                        className="hover:bg-[#F8FAFC] cursor-pointer transition-colors"
                      >
                        {/* Member Identity */}
                        <td className="py-4.5 px-5">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-[#F1F5F9] text-[#334155] border-2 border-[#CBD5E1] flex items-center justify-center font-black text-sm shadow-sm">
                              {staff.name
                                ? staff.name
                                    .split(" ")
                                    .filter(Boolean)
                                    .map((n: string) => n[0])
                                    .slice(0, 2)
                                    .join("")
                                    .toUpperCase()
                                : "ST"}
                            </div>
                            <div>
                              <div className="font-black text-base text-[#0F172A]">{staff.name}</div>
                              <div className="text-xs text-[#64748B] font-semibold">{staff.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Employee ID */}
                        <td className="py-4.5 px-5 whitespace-nowrap">
                          <span className="font-mono font-black text-sm text-[#176B63] bg-[#E8F3F1] px-2.5 py-1 rounded-lg border border-[#99F6E4]">
                            {staff.employee_id}
                          </span>
                        </td>

                        {/* Department */}
                        <td className="py-4.5 px-5 whitespace-nowrap">
                          <span className="font-extrabold text-[#0F172A]">
                            {staff.department_name || staff.department_id || "Global Facility"}
                          </span>
                        </td>

                        {/* Designation */}
                        <td className="py-4.5 px-5 max-w-xs">
                          <span className="text-sm font-semibold text-[#334155] truncate block">
                            {staff.designation}
                          </span>
                        </td>

                        {/* Role */}
                        <td className="py-4.5 px-5 whitespace-nowrap">
                          {getRoleBadge(staff.role)}
                        </td>

                        {/* Account Status */}
                        <td className="py-4.5 px-5 whitespace-nowrap">
                          {getStatusBadge(staff.account_status)}
                        </td>

                        {/* Last Login */}
                        <td className="py-4.5 px-5 whitespace-nowrap text-xs text-[#475569] font-medium tabular-nums">
                          {staff.last_login_at ? (
                            <span>{formatDateTime(staff.last_login_at)}</span>
                          ) : (
                            <span className="text-[#94A3B8] italic">Never</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-4.5 px-5 text-right whitespace-nowrap">
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center justify-end gap-1.5"
                          >
                            {staff.account_status === "locked" && (
                              <button
                                onClick={() => triggerUnlock(staff)}
                                className="px-2.5 py-1 rounded-lg bg-[#EDF7F2] hover:bg-[#D7EFE4] text-[#16805D] border border-[#A6E1CE] text-xs font-black flex items-center gap-1 cursor-pointer"
                                title="Unlock Account"
                              >
                                <Unlock className="h-3.5 w-3.5" />
                                <span>Unlock</span>
                              </button>
                            )}

                            {/* Inactivate / Activate (Admin & Superadmin access) */}
                            {staff.is_active && staff.account_status === "active" ? (
                              <button
                                onClick={() => triggerDeactivate(staff)}
                                className="px-2.5 py-1 rounded-lg bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA] text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                title="Inactivate Staff Account (Admin Access)"
                              >
                                <UserX className="h-3.5 w-3.5 text-[#B91C1C]" />
                                <span>Inactivate</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivateAccount(staff)}
                                className="px-2.5 py-1 rounded-lg bg-[#EDF7F2] hover:bg-[#D7EFE4] text-[#16805D] border border-[#A6E1CE] text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                title="Activate Staff Account (Admin Access)"
                              >
                                <UserCheck className="h-3.5 w-3.5 text-[#16805D]" />
                                <span>Activate</span>
                              </button>
                            )}

                            {/* Delete (SuperAdmin Exclusive Access) */}
                            {currentUser?.role === "superadmin" && (
                              <button
                                onClick={() => triggerDelete(staff)}
                                className="px-2.5 py-1 rounded-lg bg-[#FFF1F2] hover:bg-[#FFE4E6] text-[#E11D48] border border-[#FDA4AF] text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                title="Permanently Delete Staff Member (SuperAdmin Exclusive)"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-[#E11D48]" />
                                <span>Delete</span>
                              </button>
                            )}

                            <button
                              onClick={() => setPermissionTargetUser(staff)}
                              className="p-1.5 rounded-lg border border-[#CBD5E1] text-[#3868C9] hover:text-[#17212F] hover:bg-[#EEF4FD] cursor-pointer"
                              title="Configure Granular Permissions Matrix"
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </button>

                            <button
                              onClick={() => setSelectedStaff(staff)}
                              className="p-1.5 rounded-lg border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] hover:bg-[#E2E8F0] cursor-pointer"
                              title="Inspect Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Toolbar */}
            <div className="p-4 border-t-2 border-[#CBD5E1] bg-[#F8FAFC] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold text-[#475569]">
              <div className="flex items-center gap-2">
                <span>Showing {staffList.length} of {totalItems} hospital staff members</span>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <span>Page size:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-2 py-1 rounded-lg border border-[#CBD5E1] bg-white font-bold"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-[#0F172A]">
                  Page {page} of {totalPages}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-2 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F1F5F9] cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-2 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#F1F5F9] cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODE B: HOSPITAL DEPARTMENT MANAGEMENT & CARDS */}
      {activeViewMode === "departments" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#17212F]">Hospital Departments & Staff Roster</h2>
              <p className="text-xs text-[#667085] mt-0.5">
                {deptList.length} configurable hospital service departments and assigned supervisory personnel
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Toggle Inactive Checkbox */}
              <label className="flex items-center gap-2 text-xs font-bold text-[#475569] cursor-pointer bg-white px-3 py-2 rounded-xl border border-[#CBD5E1] shadow-2xs hover:bg-[#F8FAFC]">
                <input
                  type="checkbox"
                  checked={includeInactiveDepts}
                  onChange={(e) => setIncludeInactiveDepts(e.target.checked)}
                  className="rounded border-[#CBD5E1] text-[#176B63] focus:ring-[#176B63] cursor-pointer"
                />
                <span>Show Inactive Departments</span>
              </label>

              {/* Add Department Button (Admins only) */}
              {(currentUser?.role === "admin" || currentUser?.role === "superadmin") && (
                <button
                  onClick={() => {
                    setEditingDept(null);
                    setShowDeptManageModal(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#176B63] hover:bg-[#12534C] text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>+ Add Department</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {deptList.map((dept) => (
              <div
                key={dept.id}
                onClick={() => setSelectedAnalyticsDeptId(dept.id)}
                className={`bg-white p-6 rounded-3xl border-2 shadow-sm space-y-4 hover:border-[#3868C9] hover:shadow-md transition-all cursor-pointer group relative ${
                  dept.is_active ? "border-[#CBD5E1]" : "border-slate-200 opacity-75 bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] group-hover:bg-[#EEF4FD] group-hover:border-[#BFDBFE] transition">
                      {getDepartmentIcon(dept.icon)}
                    </div>
                    <div>
                      <span className="font-black text-base text-[#0F172A] group-hover:text-[#3868C9] transition block">
                        {dept.name}
                      </span>
                      <span className="font-mono text-[11px] font-black text-[#176B63] bg-[#E8F3F1] px-2 py-0.5 rounded border border-[#99F6E4]">
                        {dept.code}
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${
                      dept.is_active
                        ? "bg-[#EDF7F2] text-[#16805D] border-[#A6E1CE]"
                        : "bg-slate-100 text-slate-500 border-slate-300"
                    }`}
                  >
                    {dept.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <p className="text-xs text-[#475569] font-medium leading-relaxed min-h-[32px]">
                  {dept.description || "Hospital service department"}
                </p>

                <div className="pt-3 border-t-2 border-[#F1F5F9] flex justify-between text-xs font-bold text-[#475569]">
                  <span>
                    Active Tickets: <strong className="text-[#0F172A] text-sm">{dept.active_ticket_count || 0}</strong>
                  </span>
                  <span>
                    Eligible Personnel: <strong className="text-[#176B63] text-sm">{dept.staff_count || 0}</strong>
                  </span>
                </div>

                {/* Administrative Controls */}
                {(currentUser?.role === "admin" || currentUser?.role === "superadmin") && (
                  <div
                    className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      {/* Edit Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDept(dept);
                          setShowDeptManageModal(true);
                        }}
                        className="p-1.5 rounded-lg border border-[#CBD5E1] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] text-xs font-bold flex items-center gap-1 cursor-pointer"
                        title="Edit Department Name, Code, Scope"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>

                      {/* Status Toggle Button */}
                      <button
                        onClick={(e) => handleToggleDeptStatus(dept, e)}
                        className={`px-2 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition ${
                          dept.is_active
                            ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        }`}
                        title={dept.is_active ? "Deactivate Department" : "Reactivate Department"}
                      >
                        <Power className="h-3.5 w-3.5" />
                        <span>{dept.is_active ? "Deactivate" : "Activate"}</span>
                      </button>
                    </div>

                    {/* Safe Delete Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeptToDelete(dept);
                        setShowDeptDeleteModal(true);
                      }}
                      className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      title="Safely Remove Department with Dependency Check"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                )}

                <div className="pt-1 flex items-center justify-end text-[11px] font-bold text-[#3868C9] group-hover:underline">
                  <span>View Live Performance Telemetry →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <StaffDetailDrawer
        staff={selectedStaff}
        onClose={() => setSelectedStaff(null)}
        onRefresh={loadStaffDirectory}
        currentUserRole={currentUser?.role}
        onOpenUnlockModal={triggerUnlock}
        onOpenDeactivateModal={triggerDeactivate}
        onOpenDeleteModal={triggerDelete}
        onOpenResetPasswordModal={triggerResetPassword}
        onActivateAccount={handleActivateAccount}
      />

      {/* Create Staff Modal */}
      <CreateStaffModal
        departments={deptList}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          loadStaffDirectory();
          loadDepartments();
          setActionSuccessMessage("New hospital staff account created successfully.");
          setTimeout(() => setActionSuccessMessage(null), 4000);
        }}
      />

      {/* Roles & Permissions Modal */}
      <RolesManagementModal
        isOpen={showRolesModal}
        onClose={() => setShowRolesModal(false)}
      />

      {/* Security Events Audit Modal */}
      <SecurityEventsModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
      />

      {/* Action Confirmation Modal (Unlock / Inactivate / Delete / Reset Password) */}
      {actionType && actionTargetStaff && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div
            onClick={() => setActionType(null)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
          />

          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border-2 border-[#CBD5E1] p-6 z-10 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h3 className="font-black text-lg text-[#0F172A] flex items-center gap-2">
                {actionType === "unlock" ? (
                  <>
                    <Unlock className="h-5 w-5 text-[#16805D]" />
                    <span>Unlock Account</span>
                  </>
                ) : actionType === "deactivate" ? (
                  <>
                    <UserX className="h-5 w-5 text-[#DC2626]" />
                    <span>Inactivate Staff Account</span>
                  </>
                ) : actionType === "delete" ? (
                  <>
                    <Trash2 className="h-5 w-5 text-[#E11D48]" />
                    <span>Permanently Delete Staff (SuperAdmin)</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-5 w-5 text-[#176B63]" />
                    <span>Reset Credentials</span>
                  </>
                )}
              </h3>
              <button
                onClick={() => setActionType(null)}
                className="p-1 rounded-lg text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-sm text-[#334155] font-semibold">
              Target: <strong className="text-[#0F172A]">{actionTargetStaff.name}</strong> ({actionTargetStaff.employee_id})
            </div>

            {actionType === "unlock" && (
              <div className="space-y-3">
                <p className="text-xs text-[#475569]">
                  Unlocking this account will clear the consecutive failure counter (currently {actionTargetStaff.failed_login_attempts}) and restore authentication eligibility.
                </p>
                <div>
                  <label className="text-xs font-bold text-[#334155] block mb-1">
                    Administrative Reason for Unlock <span className="text-[#DC2626]">*</span>
                  </label>
                  <textarea
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 rounded-xl border-2 border-[#CBD5E1] text-xs font-medium focus:outline-none focus:border-[#176B63]"
                    placeholder="Enter justification for audit log..."
                  />
                </div>
              </div>
            )}

            {actionType === "deactivate" && (
              <div className="space-y-3">
                <p className="text-xs text-[#DC2626] font-semibold">
                  Inactivating this account will immediately revoke login access. Historical tickets and evidence will remain intact.
                </p>
                <div>
                  <label className="text-xs font-bold text-[#334155] block mb-1">
                    Administrative Reason for Inactivation <span className="text-[#DC2626]">*</span>
                  </label>
                  <textarea
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 rounded-xl border-2 border-[#CBD5E1] text-xs font-medium focus:outline-none focus:border-[#176B63]"
                    placeholder="Enter reason for inactivation..."
                  />
                </div>
              </div>
            )}

            {actionType === "delete" && (
              <div className="space-y-3">
                <div className="p-3 bg-[#FFF1F2] border-2 border-[#FDA4AF] rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-[#E11D48] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#9F1239] font-semibold leading-relaxed">
                    <strong>SuperAdmin Exclusive Action:</strong> You are about to permanently delete <strong>{actionTargetStaff.name}</strong> ({actionTargetStaff.employee_id || actionTargetStaff.email}). All assigned tickets will be safely unlinked. This action CANNOT be reversed.
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-[#334155] block mb-1">
                    Administrative Reason for Permanent Deletion <span className="text-[#DC2626]">*</span>
                  </label>
                  <textarea
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 rounded-xl border-2 border-[#CBD5E1] text-xs font-medium focus:outline-none focus:border-[#E11D48]"
                    placeholder="Enter compliance justification for audit log..."
                  />
                </div>
              </div>
            )}

            {actionType === "reset_password" && (
              <div className="space-y-3">
                <p className="text-xs text-[#475569]">
                  This will generate a new single-use temporary password and require the staff member to configure their own password on their next login.
                </p>
                {generatedTempPw ? (
                  <div className="p-3 bg-[#EDF7F2] border-2 border-[#A6E1CE] rounded-xl space-y-2">
                    <span className="text-xs font-bold text-[#16805D] block">
                      New Temporary Password Generated:
                    </span>
                    <div className="font-mono text-base font-black text-[#0F172A] bg-white p-2 rounded-lg border border-[#CBD5E1] select-all">
                      {generatedTempPw}
                    </div>
                    <p className="text-xs text-[#475569]">
                      Communicate this credential securely to the employee. It will not be shown again.
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2.5 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setActionType(null)}
                className="px-4 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#475569] hover:bg-[#F8FAFC]"
              >
                {generatedTempPw ? "Done" : "Cancel"}
              </button>

              {!generatedTempPw && (
                <button
                  type="button"
                  onClick={executeSensitiveAction}
                  disabled={isSubmittingAction || (actionType !== "reset_password" && !actionReason.trim())}
                  className={`px-5 py-2 rounded-xl text-white text-xs font-black shadow-sm cursor-pointer disabled:opacity-50 ${
                    actionType === "delete"
                      ? "bg-[#E11D48] hover:bg-[#BE123C]"
                      : actionType === "deactivate"
                      ? "bg-[#DC2626] hover:bg-[#B91C1C]"
                      : "bg-[#176B63] hover:bg-[#10574F]"
                  }`}
                >
                  {isSubmittingAction
                    ? "Processing..."
                    : actionType === "delete"
                    ? "Permanently Delete"
                    : actionType === "deactivate"
                    ? "Inactivate Account"
                    : "Confirm Action"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Department Performance Analytics Modal */}
      {selectedAnalyticsDeptId && (
        <DepartmentAnalyticsModal
          departmentId={selectedAnalyticsDeptId}
          onClose={() => setSelectedAnalyticsDeptId(null)}
        />
      )}

      {/* Staff Granular Permission Matrix Modal */}
      {permissionTargetUser && (
        <PermissionMatrixModal
          isOpen={true}
          onClose={() => setPermissionTargetUser(null)}
          userId={permissionTargetUser.id}
          userName={permissionTargetUser.name}
          userRole={permissionTargetUser.role}
          isSuperadminTarget={false}
          onSaved={loadStaffDirectory}
        />
      )}

      {/* Department Add/Edit Modal */}
      <DepartmentManageModal
        isOpen={showDeptManageModal}
        onClose={() => {
          setShowDeptManageModal(false);
          setEditingDept(null);
        }}
        onSuccess={() => {
          loadDepartments();
        }}
        department={editingDept}
      />

      {/* Department Safe Deletion & Dependency Modal */}
      <DepartmentDeleteModal
        isOpen={showDeptDeleteModal}
        onClose={() => {
          setShowDeptDeleteModal(false);
          setDeptToDelete(null);
        }}
        onSuccess={() => {
          loadDepartments();
        }}
        department={deptToDelete}
        allDepartments={deptList}
      />
    </div>
  );
}
