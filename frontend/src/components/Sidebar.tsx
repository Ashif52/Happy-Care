"use client";

import React from "react";
import {
  LayoutDashboard,
  Ticket,
  Briefcase,
  Sparkles,
  ClockAlert,
  Building2,
  QrCode,
  BarChart3,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Lock,
  Database,
  HeartHandshake,
  Star,
  LogOut,
  Mail,
  Users
} from "lucide-react";
import { User } from "@/lib/api";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  currentUser: User | null;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  onOpenPatientPortal: () => void;
  onOpenEditProfile?: () => void;
  onLogout: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: string;
  badgeStyle?: string;
  group?: string;
}

export function Sidebar({
  currentTab,
  setCurrentTab,
  currentUser,
  collapsed,
  setCollapsed,
  onOpenPatientPortal,
  onOpenEditProfile,
  onLogout,
}: SidebarProps) {
  const userRole = currentUser?.role || "admin";

  // Strict Role-Based Navigation Items with Apple-style group semantics
  let navGroups: {
    groupTitle?: string;
    items: NavItem[];
  }[] = [];

  if (userRole === "superadmin") {
    navGroups = [
      {
        groupTitle: "Superadmin Authority",
        items: [
          { id: "superadmin-admins", label: "Admin Accounts", icon: UserCheck },
          { id: "superadmin-security", label: "Security Settings", icon: Lock },
          { id: "superadmin-audit", label: "Superadmin Audit", icon: ScrollText },
          { id: "superadmin-maintenance", label: "Database Purge", icon: Database },
        ],
      },
      {
        groupTitle: "Operations",
        items: [
          { id: "overview", label: "Executive Dashboard", icon: LayoutDashboard },
          { id: "tickets", label: "All Tickets", icon: Ticket },
          { id: "my-department", label: "Staff Workspace", icon: Briefcase },
          { id: "ai-verify", label: "AI Verification", icon: Sparkles },
          { id: "sla", label: "Escalation & SLA", icon: ClockAlert },
        ],
      },
      {
        groupTitle: "Care Units & Experience",
        items: [
          { id: "departments", label: "Departments & Staff", icon: Building2 },
          { id: "patient-accounts", label: "Patient Accounts", icon: Users },
          { id: "rooms", label: "QR Room Ops", icon: QrCode },
          { id: "nps", label: "NPS & Patient Voice", icon: HeartHandshake },
          { id: "reviews", label: "Google Reputation", icon: Star },
        ],
      },
      {
        groupTitle: "Platform & System",
        items: [
          { id: "emails", label: "Email & SMTP", icon: Mail },
          { id: "analytics", label: "Analytics & Reports", icon: BarChart3 },
          { id: "audit", label: "Audit Logs", icon: ScrollText },
          { id: "settings", label: "Settings & System", icon: Settings },
        ],
      },
    ];
  } else if (userRole === "admin") {
    navGroups = [
      {
        groupTitle: "Operations",
        items: [
          { id: "overview", label: "Overview", icon: LayoutDashboard },
          { id: "tickets", label: "All Tickets", icon: Ticket },
          { id: "my-department", label: "Staff Workspace", icon: Briefcase },
          { id: "ai-verify", label: "AI Verification", icon: Sparkles },
          { id: "sla", label: "Escalation & SLA", icon: ClockAlert },
        ],
      },
      {
        groupTitle: "Care Units & Experience",
        items: [
          { id: "departments", label: "Departments & Staff", icon: Building2 },
          { id: "patient-accounts", label: "Patient Accounts", icon: Users },
          { id: "rooms", label: "QR Room Ops", icon: QrCode },
          { id: "nps", label: "NPS & Patient Voice", icon: HeartHandshake },
          { id: "reviews", label: "Google Reputation", icon: Star },
        ],
      },
      {
        groupTitle: "Platform & System",
        items: [
          { id: "emails", label: "Email & SMTP", icon: Mail },
          { id: "analytics", label: "Analytics & Reports", icon: BarChart3 },
          { id: "audit", label: "Audit Logs", icon: ScrollText },
          { id: "settings", label: "Settings & System", icon: Settings },
        ],
      },
    ];
  } else if (userRole === "supervisor") {
    navGroups = [
      {
        groupTitle: "Command",
        items: [
          { id: "overview", label: "Department Dashboard", icon: LayoutDashboard },
          { id: "tickets", label: "Department Tickets", icon: Ticket },
          { id: "my-department", label: "Supervisor Workspace", icon: Briefcase },
          { id: "departments", label: "My Team & Staff", icon: Building2 },
        ],
      },
      {
        groupTitle: "Intelligence",
        items: [
          { id: "ai-verify", label: "AI Verification", icon: Sparkles },
          { id: "sla", label: "Escalations", icon: ClockAlert },
          { id: "analytics", label: "Department Analytics", icon: BarChart3 },
          { id: "nps", label: "Patient Experience", icon: HeartHandshake },
          { id: "reviews", label: "Google Reviews", icon: Star },
        ],
      },
    ];
  } else {
    // Staff
    navGroups = [
      {
        groupTitle: "My Queue",
        items: [
          { id: "overview", label: "My Overview", icon: LayoutDashboard },
          { id: "tickets", label: "Assigned Tickets", icon: Ticket },
          { id: "my-department", label: "Tasks & Evidence", icon: Briefcase },
          { id: "reviews", label: "Patient Feedback", icon: Star },
        ],
      },
    ];
  }

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-30 flex flex-col bg-white/85 backdrop-blur-xl border-r border-slate-200/75 shadow-[0_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 select-none ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Sleek Apple-style Brand Header */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-slate-200/70 shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="h-7.5 w-7.5 rounded-xl bg-gradient-to-br from-[#176B63] to-[#0D544C] flex items-center justify-center shrink-0 shadow-xs text-white">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-black text-sm tracking-tight text-slate-900 flex items-center gap-1 leading-tight">
                Happy <span className="text-[#176B63]">Care</span>
              </span>
              <span className="text-[9.5px] text-slate-400 tracking-wider font-extrabold uppercase truncate">
                {userRole === "superadmin"
                  ? "Executive Root"
                  : userRole === "admin"
                  ? "Admin Operations"
                  : userRole === "supervisor"
                  ? "Supervisor View"
                  : "Staff Portal"}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-6.5 w-6.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-3 scrollbar-thin">
        {navGroups.map((group, gIdx) => (
          <div key={`group-${gIdx}`} className="space-y-0.5">
            {!collapsed && group.groupTitle && (
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400 px-2.5 pt-1.5 pb-1">
                {group.groupTitle}
              </div>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all group cursor-pointer relative ${
                    isActive
                      ? "bg-[#176B63]/10 text-[#176B63] font-bold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  {/* Subtle Apple vertical indicator bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#176B63]" />
                  )}
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      isActive ? "text-[#176B63]" : "text-slate-400 group-hover:text-slate-700"
                    }`}
                  />
                  {!collapsed && (
                    <span className="flex-1 text-left truncate">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Staff Notice when in Staff Role */}
        {!collapsed && userRole === "staff" && (
          <div className="p-2.5 my-2 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-600 space-y-0.5">
            <span className="font-extrabold text-slate-800 block">Staff Workspace Active</span>
            <p className="text-[10px] leading-relaxed text-slate-500">
              Admin governance tools are restricted to administrator credentials.
            </p>
          </div>
        )}

        {/* Patient Bedside Simulator Action Card (Admin & SuperAdmin) */}
        {(userRole === "admin" || userRole === "superadmin") && (
          <div className="pt-2">
            <button
              onClick={onOpenPatientPortal}
              className={`w-full flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                collapsed
                  ? "justify-center bg-amber-50/80 hover:bg-amber-100/80 text-amber-800 border-amber-200/70"
                  : "bg-gradient-to-r from-amber-50/70 to-amber-100/40 hover:from-amber-100/70 hover:to-amber-100/60 border-amber-200/60 text-amber-900"
              }`}
              title="Admin: Test Bedside Patient QR Flow"
            >
              <div className="h-6 w-6 rounded-lg bg-amber-200/70 text-amber-800 flex items-center justify-center shrink-0">
                <QrCode className="h-3.5 w-3.5" />
              </div>
              {!collapsed && (
                <div className="text-left min-w-0 flex-1">
                  <div className="text-[11.5px] font-extrabold text-amber-900 truncate">Test Bedside QR</div>
                  <div className="text-[9.5px] text-amber-700/80 font-medium">Patient Simulator</div>
                </div>
              )}
            </button>
          </div>
        )}
      </nav>

      {/* User Account Footer */}
      <div className="p-2.5 border-t border-slate-200/70 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-2">
          <div
            onClick={onOpenEditProfile}
            className={`flex items-center gap-2 flex-1 min-w-0 ${
              onOpenEditProfile ? "cursor-pointer p-1 -m-1 rounded-lg hover:bg-slate-200/50 transition-colors" : ""
            }`}
            title={onOpenEditProfile ? "Click to view and edit profile" : undefined}
          >
            <div className="relative shrink-0">
              <div className="h-7.5 w-7.5 rounded-full bg-[#176B63]/12 text-[#176B63] ring-1 ring-[#176B63]/25 flex items-center justify-center font-black text-[11px] shadow-2xs">
                {currentUser?.name
                  ? currentUser.name
                      .split(" ")
                      .filter(Boolean)
                      .map((n: string) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()
                  : "U"}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#16805D] ring-2 ring-white" />
            </div>
            {!collapsed && (
              <div className="flex-1 overflow-hidden min-w-0 text-left">
                <div className="text-[11.5px] font-black text-slate-800 truncate leading-tight hover:text-[#176B63] transition-colors">
                  {currentUser?.name || "Hospital User"}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className={`text-[8.5px] uppercase font-black px-1.5 py-0.2 rounded tracking-wider border leading-tight ${
                      userRole === "superadmin"
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : userRole === "admin"
                        ? "bg-[#176B63]/10 text-[#176B63] border-[#176B63]/20"
                        : userRole === "supervisor"
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    }`}
                  >
                    {userRole}
                  </span>
                  {currentUser?.department_id && (
                    <span className="text-[9.5px] text-slate-500 capitalize font-medium truncate">
                      {currentUser.department_id}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onLogout}
            className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Log Out / Switch Portal"
            aria-label="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
