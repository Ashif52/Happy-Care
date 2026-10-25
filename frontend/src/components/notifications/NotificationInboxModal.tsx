"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Inbox,
  Bell,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  PlayCircle,
  ShieldCheck,
  Search,
  Filter,
  Check,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  Trash2,
  Layers
} from "lucide-react";
import { api, NotificationItem, formatDateTime } from "@/lib/api";

interface NotificationInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTicket?: (ticketId: number) => void;
  onNavigateTab?: (tab: string) => void;
  onRefreshUnreadCount?: () => void;
}

export function NotificationInboxModal({
  isOpen,
  onClose,
  onSelectTicket,
  onNavigateTab,
  onRefreshUnreadCount,
}: NotificationInboxModalProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedEventType, setSelectedEventType] = useState<string>("all");
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadNotifications = useCallback(async (targetPage = page) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp: any = await api.getNotifications({
        unread_only: unreadOnly || undefined,
        page: targetPage,
        page_size: pageSize,
        search: debouncedSearch.trim() || undefined,
        event_type: selectedEventType !== "all" ? selectedEventType : undefined,
      });

      setItems(resp.items || []);
      setTotalCount(resp.total || 0);
      setUnreadCount(resp.unread_count || 0);
      if (onRefreshUnreadCount) onRefreshUnreadCount();
    } catch (err: any) {
      console.error("Failed to load notifications inbox:", err);
      setErrorMsg(err.message || "Unable to fetch notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, unreadOnly, debouncedSearch, selectedEventType, onRefreshUnreadCount]);

  useEffect(() => {
    if (isOpen) {
      loadNotifications(page);
    }
  }, [isOpen, page, unreadOnly, debouncedSearch, selectedEventType, loadNotifications]);

  if (!isOpen) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleMarkAsRead = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      if (onRefreshUnreadCount) onRefreshUnreadCount();
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    try {
      await api.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      if (onRefreshUnreadCount) onRefreshUnreadCount();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      await api.deleteNotification(id);
      setItems((prev) => prev.filter((n) => n.id !== id));
      setTotalCount((t) => Math.max(0, t - 1));
      if (onRefreshUnreadCount) onRefreshUnreadCount();
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      try {
        await api.markNotificationRead(notif.id);
        setItems((prev) => prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
        if (onRefreshUnreadCount) onRefreshUnreadCount();
      } catch (_) {}
    }

    onClose();

    if (notif.ticket_id && onSelectTicket) {
      onSelectTicket(notif.ticket_id);
      return;
    }

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

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case "SLA_BREACH":
      case "TICKET_ESCALATED":
      case "ESCALATION_LEVEL_TRIGGERED":
        return {
          icon: AlertTriangle,
          bg: "bg-rose-50 text-rose-700 border-rose-200",
          label: "SLA Alert",
        };
      case "NEW_TICKET":
      case "PATIENT_REQUEST_RECEIVED":
        return {
          icon: Inbox,
          bg: "bg-[#E8F3F1] text-[#176B63] border-[#B6DCD7]",
          label: "New Request",
        };
      case "TICKET_ASSIGNED":
      case "TICKET_REASSIGNED":
        return {
          icon: UserCheck,
          bg: "bg-blue-50 text-blue-700 border-blue-200",
          label: "Assignment",
        };
      case "WORK_STARTED":
      case "PATIENT_WORK_STARTED":
        return {
          icon: PlayCircle,
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          label: "In Progress",
        };
      case "RESOLUTION_SUBMITTED":
      case "TASK_APPROVED":
      case "WORK_COMPLETED":
      case "PATIENT_WORK_COMPLETED":
      case "PATIENT_TICKET_CLOSED":
        return {
          icon: CheckCircle2,
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          label: "Resolved",
        };
      default:
        return {
          icon: Bell,
          bg: "bg-slate-100 text-slate-700 border-slate-200",
          label: "System",
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[85vh] max-h-[800px]">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#176B63] text-white flex items-center justify-center shadow-sm">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  Notification Inbox
                </h2>
                {unreadCount > 0 && (
                  <span className="bg-[#176B63] text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Authorized operational alerts, SLA breaches, and assignment activity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadNotifications(page)}
              disabled={isLoading}
              className="h-8 w-8 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
              title="Refresh inbox"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Toolbar: Search, Filter, Mark All */}
        <div className="p-3.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications, tickets, or messages..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B63] transition-all"
            />
          </div>

          {/* Event Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={selectedEventType}
              onChange={(e) => {
                setSelectedEventType(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none cursor-pointer"
            >
              <option value="all">All Alert Types</option>
              <option value="SLA_BREACH">SLA Breaches</option>
              <option value="NEW_TICKET">New Requests</option>
              <option value="TICKET_ASSIGNED">Assignments</option>
              <option value="WORK_STARTED">In Progress</option>
              <option value="RESOLUTION_SUBMITTED">Verification</option>
              <option value="PATIENT_REQUEST_RECEIVED">Patient Notices</option>
            </select>

            <button
              onClick={() => {
                setUnreadOnly(!unreadOnly);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                unreadOnly
                  ? "bg-[#176B63] text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Unread Only
            </button>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={isMarkingAll}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Check className="h-3 w-3 text-[#176B63]" />
                <span>Mark All Read</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {errorMsg && (
            <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => loadNotifications(page)} className="font-bold underline cursor-pointer">
                Retry
              </button>
            </div>
          )}

          {isLoading && items.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#176B63]" />
              <span className="text-xs font-semibold">Loading notification records...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm">No notifications found</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-0.5">
                  {unreadOnly
                    ? "You have marked all pending notifications as read."
                    : searchQuery
                    ? `No notifications matched "${searchQuery}".`
                    : "No notifications have been recorded for your account."}
                </p>
              </div>
            </div>
          ) : (
            items.map((notif) => {
              const badge = getEventBadge(notif.event_type);
              const IconComp = badge.icon;

              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-4 transition-all cursor-pointer flex items-start gap-3.5 hover:bg-slate-50/90 relative ${
                    !notif.is_read ? "bg-[#F8FAFC]" : "bg-white opacity-85"
                  }`}
                >
                  {/* Unread Accent Bar */}
                  {!notif.is_read && (
                    <span className="absolute left-0 top-3 bottom-3 w-1 bg-[#176B63] rounded-r" />
                  )}

                  {/* Icon Badge */}
                  <div
                    className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center border shadow-2xs ${badge.bg}`}
                  >
                    <IconComp className="h-4.5 w-4.5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-xs sm:text-sm">
                          {notif.title}
                        </span>
                        <span
                          className={`text-[9.5px] uppercase font-black px-1.5 py-0.5 rounded border ${badge.bg}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">
                        {formatDateTime(notif.created_at)}
                      </span>
                    </div>

                    <p className="text-slate-700 text-xs font-medium leading-relaxed">
                      {notif.message}
                    </p>

                    {/* Metadata & Actions Footer */}
                    <div className="mt-2.5 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2 text-slate-500">
                        {notif.ticket_number && (
                          <span className="font-bold text-[#176B63] bg-[#176B63]/10 px-2 py-0.5 rounded flex items-center gap-1">
                            <span>Ticket #{notif.ticket_number}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {notif.department_id && (
                          <span className="capitalize font-semibold text-slate-600">
                            Dept: {notif.department_id}
                          </span>
                        )}
                        {notif.read_at && (
                          <span className="text-[10px] text-slate-400">
                            Read: {formatDateTime(notif.read_at)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!notif.is_read && (
                          <button
                            onClick={(e) => handleMarkAsRead(e, notif.id)}
                            className="text-[#176B63] hover:bg-[#176B63]/10 font-bold px-2 py-0.5 rounded transition-colors cursor-pointer"
                          >
                            Mark Read
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(e, notif.id)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-colors cursor-pointer"
                          title="Delete notification"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between text-xs">
          <div className="text-slate-500 font-medium">
            Showing <strong className="text-slate-800">{items.length}</strong> of{" "}
            <strong className="text-slate-800">{totalCount}</strong> alerts
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </button>

            <span className="font-bold text-slate-700 px-1">
              Page {page} of {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
