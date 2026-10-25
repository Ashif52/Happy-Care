"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Inbox,
  UserCheck,
  PlayCircle,
  ShieldCheck,
  Check,
  ExternalLink,
  RefreshCw,
  Clock,
  Layers,
  X
} from "lucide-react";
import { api, NotificationItem, formatDateTime } from "@/lib/api";
import { NotificationInboxModal } from "./NotificationInboxModal";

interface NotificationBellDropdownProps {
  onSelectTicket?: (ticketId: number) => void;
  onNavigateTab?: (tab: string) => void;
}

export function NotificationBellDropdown({
  onSelectTicket,
  onNavigateTab,
}: NotificationBellDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load notifications from API
  const loadNotifications = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const resp = await api.getNotifications(unreadOnly, 30, 0);
      setNotifications(resp.items || []);
      setUnreadCount(resp.unread_count || 0);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  // Poll for unread count periodically
  useEffect(() => {
    loadNotifications(false);
    const interval = setInterval(() => {
      loadNotifications(false);
    }, 25000); // 25s polling
    return () => clearInterval(interval);
  }, [unreadOnly]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Mark single notification as read
  const handleMarkAsRead = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Navigate on clicking notification
  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      try {
        api.markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (e) {
        // non-blocking
      }
    }

    setIsOpen(false);

    // If ticket ID is attached, open ticket details modal directly
    if (notif.ticket_id && onSelectTicket) {
      onSelectTicket(notif.ticket_id);
      return;
    }

    // Otherwise navigate to destination link or relevant tab
    if (notif.destination_link && onNavigateTab) {
      if (notif.destination_link.startsWith("/tickets")) {
        onNavigateTab("tickets");
      } else if (notif.destination_link.startsWith("/my-department")) {
        onNavigateTab("my-department");
      } else if (notif.destination_link.startsWith("/ai-verify")) {
        onNavigateTab("ai-verify");
      } else if (notif.destination_link.startsWith("/overview")) {
        onNavigateTab("overview");
      }
    }
  };

  // Get event icon and styles
  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case "SLA_BREACH":
        return {
          icon: AlertTriangle,
          bg: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]",
          iconColor: "text-[#DC2626]"
        };
      case "NEW_TICKET":
        return {
          icon: Inbox,
          bg: "bg-[#E8F3F1] text-[#176B63] border-[#B6DCD7]",
          iconColor: "text-[#176B63]"
        };
      case "TICKET_ASSIGNED":
        return {
          icon: UserCheck,
          bg: "bg-[#EEF4FD] text-[#2563EB] border-[#BFDBFE]",
          iconColor: "text-[#2563EB]"
        };
      case "WORK_STARTED":
        return {
          icon: PlayCircle,
          bg: "bg-[#F3E8FF] text-[#7C3AED] border-[#DDD6FE]",
          iconColor: "text-[#7C3AED]"
        };
      case "RESOLUTION_SUBMITTED":
        return {
          icon: CheckCircle2,
          bg: "bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]",
          iconColor: "text-[#D97706]"
        };
      case "AI_VERIFICATION_COMPLETE":
        return {
          icon: Sparkles,
          bg: "bg-[#EDE9FE] text-[#6D28D9] border-[#DDD6FE]",
          iconColor: "text-[#6D28D9]"
        };
      case "TICKET_CLOSED":
        return {
          icon: ShieldCheck,
          bg: "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]",
          iconColor: "text-[#059669]"
        };
      default:
        return {
          icon: Bell,
          bg: "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]",
          iconColor: "text-[#475569]"
        };
    }
  };

  // Helper for human-readable relative time
  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return formatDateTime(dateStr, { month: "short", day: "numeric" });
    } catch (e) {
      return "Recently";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) loadNotifications(true);
        }}
        className="p-2 rounded-xl text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-all relative cursor-pointer"
        title="Role-Aware Operational Notifications"
        aria-label="Notifications"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-4.5 h-4.5 px-1 text-[10px] font-black text-white bg-[#DC2626] rounded-full shadow-sm ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Glassmorphic Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-88 sm:w-96 glass-popover rounded-2xl p-0 text-xs z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between bg-white/70">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[#0F172A] text-sm tracking-tight">
                Operational Alerts
              </span>
              {unreadCount > 0 ? (
                <span className="text-[10px] text-[#176B63] bg-[#E8F3F1] border border-[#B6DCD7] px-2 py-0.5 rounded-full font-bold">
                  {unreadCount} Unread
                </span>
              ) : (
                <span className="text-[10px] text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full font-semibold">
                  All caught up
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => loadNotifications(true)}
                disabled={isLoading}
                className="p-1 text-[#64748B] hover:text-[#0F172A] rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
                title="Refresh alerts"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-[#176B63]" : ""}`} />
              </button>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingAll}
                  className="flex items-center gap-1 text-[11px] font-bold text-[#176B63] hover:text-[#10574F] px-2 py-1 rounded-lg hover:bg-[#E8F3F1] transition-all cursor-pointer"
                  title="Mark all as read"
                >
                  <Check className="h-3 w-3" />
                  <span>Mark All Read</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2 bg-[#F8FAFC]/80 border-b border-[#E2E8F0] flex items-center gap-2">
            <button
              onClick={() => setUnreadOnly(false)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                !unreadOnly
                  ? "bg-[#176B63] text-white shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A] hover:bg-black/5"
              }`}
            >
              All Alerts
            </button>
            <button
              onClick={() => setUnreadOnly(true)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                unreadOnly
                  ? "bg-[#176B63] text-white shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A] hover:bg-black/5"
              }`}
            >
              Unread Only {unreadCount > 0 && `(${unreadCount})`}
            </button>
          </div>

          {/* Notifications Scrollable List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-[#E2E8F0]/60">
            {isLoading && notifications.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center space-y-2 text-[#64748B]">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#176B63]" />
                <span className="text-[11px] font-semibold">Checking notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-[#E8F3F1] flex items-center justify-center text-[#176B63]">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className="font-bold text-[#0F172A] text-xs">No active alerts</p>
                <p className="text-[11px] text-[#64748B] max-w-xs">
                  {unreadOnly
                    ? "You have marked all your operational notifications as read."
                    : "No alerts have been recorded for your account."}
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const badge = getEventBadge(notif.event_type);
                const IconComp = badge.icon;

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3 sm:p-3.5 transition-all cursor-pointer flex items-start gap-3 hover:bg-white/90 relative ${
                      !notif.is_read ? "bg-[#F8FAFC]/90" : "bg-transparent opacity-85"
                    }`}
                  >
                    {/* Unread Indicator Dot */}
                    {!notif.is_read && (
                      <span className="absolute left-1.5 top-5 h-1.5 w-1.5 rounded-full bg-[#176B63]" />
                    )}

                    {/* Icon Badge */}
                    <div
                      className={`h-8 w-8 rounded-xl shrink-0 flex items-center justify-center border shadow-xs ${badge.bg}`}
                    >
                      <IconComp className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-extrabold text-[#0F172A] text-xs truncate">
                          {notif.title}
                        </span>
                        <span className="text-[10px] font-medium text-[#64748B] whitespace-nowrap">
                          {formatTimeAgo(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-[#334155] text-[11px] font-medium leading-relaxed line-clamp-2">
                        {notif.message}
                      </p>

                      {/* Footer Info & Actions */}
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-2 text-[#64748B]">
                          {notif.ticket_number && (
                            <span className="font-bold text-[#176B63] bg-[#E8F3F1] px-1.5 py-0.5 rounded">
                              {notif.ticket_number}
                            </span>
                          )}
                          {notif.department_id && (
                            <span className="capitalize font-semibold">
                              {notif.department_id}
                            </span>
                          )}
                        </div>

                        {!notif.is_read && (
                          <button
                            onClick={(e) => handleMarkAsRead(e, notif.id)}
                            className="text-[#64748B] hover:text-[#176B63] font-bold px-1.5 py-0.5 rounded hover:bg-black/5 transition-colors cursor-pointer"
                            title="Mark as read"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: View All Notifications & Inbox */}
          <div className="p-2 border-t border-[#E2E8F0] bg-slate-50/90">
            <button
              onClick={() => {
                setIsOpen(false);
                setShowInboxModal(true);
              }}
              className="w-full py-2 px-3 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[11px] font-bold text-[#176B63] flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <span>View All Notifications & Inbox</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Full Paginated Notification Inbox Modal */}
      <NotificationInboxModal
        isOpen={showInboxModal}
        onClose={() => setShowInboxModal(false)}
        onSelectTicket={onSelectTicket}
        onNavigateTab={onNavigateTab}
        onRefreshUnreadCount={() => loadNotifications(false)}
      />
    </div>
  );
}
