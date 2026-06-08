import React, { useState, useEffect, useRef } from "react";
import { cn } from "./ui";
import { useAuth } from "@/context/AuthContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  LayoutDashboard, Users, Building2, UserCog,
  FileText, Upload, Activity, BarChart3, Megaphone,
  LogOut, Menu, X, ChevronRight, GraduationCap,
  UtensilsCrossed, Package, History, ClipboardCheck,
  Wifi, WifiOff, Loader2,
} from "lucide-react";

export type Page =
  | "dashboard" | "students" | "attendance" | "mess" | "inventory" | "hostels"
  | "staff" | "announcements" | "csv-import" | "activity-logs"
  | "reports" | "master-table" | "manage-admins" | "history";

const COORD_UP = ["coordinator", "admin", "superadmin"];
const ADMIN_UP = ["admin", "superadmin"];
const STAFF_ROLES = ["volunteer", "coordinator", "admin", "superadmin"];

export const NAV: { id: Page; label: string; icon: React.ElementType; roles?: string[] }[] = [
  { id: "dashboard",     label: "Dashboard",      icon: LayoutDashboard },
  { id: "attendance",    label: "Attendance",      icon: ClipboardCheck },
  { id: "mess",          label: "Mess Cards",      icon: UtensilsCrossed },
  { id: "inventory",     label: "Inventory",       icon: Package },
  { id: "activity-logs", label: "Activity Logs",   icon: Activity,    roles: [...COORD_UP] },
  { id: "students",      label: "Students",        icon: Users,       roles: [...COORD_UP] },
  { id: "hostels",       label: "Hostels",         icon: Building2,   roles: [...COORD_UP] },
  { id: "staff",         label: "Staff",           icon: UserCog,     roles: [...COORD_UP] },
  { id: "announcements", label: "Announcements",   icon: Megaphone,   roles: [...COORD_UP] },
  { id: "master-table",  label: "Master Table",    icon: GraduationCap, roles: [...ADMIN_UP] },
  { id: "history",       label: "History",         icon: History,     roles: [...ADMIN_UP] },
  { id: "reports",       label: "Reports",         icon: BarChart3,   roles: [...ADMIN_UP] },
  { id: "csv-import",    label: "CSV Import",      icon: Upload,      roles: ["superadmin"] },
  { id: "manage-admins", label: "Manage Staff",    icon: FileText,    roles: ["superadmin"] },
];

function ActiveStatusButton({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const role = user?.role || "";
  const isStaff = STAFF_ROLES.includes(role);
  const [showModal, setShowModal] = useState(false);
  const [remark, setRemark] = useState("");
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["my-staff-status"],
    queryFn: () => apiFetch<any>("/staff/me-status"),
    refetchInterval: 30000,
    enabled: isStaff,
  });

  const isActive = !!status?.isActive;

  const goActiveMut = useMutation({
    mutationFn: (r: string) => apiFetch("/staff/go-active", { method: "POST", body: JSON.stringify({ remark: r }) }),
    onSuccess: () => { refetchStatus(); setShowModal(false); setRemark(""); },
  });

  const goInactiveMut = useMutation({
    mutationFn: (r: string) => apiFetch("/staff/go-inactive", { method: "POST", body: JSON.stringify({ remark: r }) }),
    onSuccess: () => { refetchStatus(); setShowModal(false); setRemark(""); },
  });

  useEffect(() => {
    if (isActive) {
      heartbeatRef.current = setInterval(() => {
        apiFetch("/staff/heartbeat", { method: "POST" }).catch(() => {});
      }, 5 * 60 * 1000);
    } else {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    }
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [isActive]);

  if (!isStaff) return null;

  const isPending = goActiveMut.isPending || goInactiveMut.isPending;

  function handleToggle() {
    setRemark("");
    setShowModal(true);
  }

  function handleConfirm() {
    if (isActive) {
      goInactiveMut.mutate(remark || "Going offline");
    } else {
      goActiveMut.mutate(remark || "Starting shift");
    }
  }

  return (
    <>
      <button
        onClick={handleToggle}
        title={isActive ? "Go Inactive" : "Go Active"}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border",
          isActive
            ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15"
            : "bg-white/5 text-slate-400 border-white/8 hover:bg-white/8 hover:text-slate-200",
          collapsed && "justify-center px-2",
        )}
      >
        {isPending
          ? <Loader2 size={14} className="animate-spin flex-shrink-0" />
          : isActive
            ? <Wifi size={14} className="flex-shrink-0 text-green-400" />
            : <WifiOff size={14} className="flex-shrink-0" />}
        {!collapsed && (
          <span>{isActive ? "Active" : "Go Active"}</span>
        )}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={() => setShowModal(false)}>
          <div className="bg-[#0f0f13] border border-white/10 rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-white">
                {isActive ? "Go Inactive" : "Go Active"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {isActive ? "Mark yourself as offline. Add a remark (optional)." : "Mark yourself as on-shift. Add a remark (optional)."}
            </p>
            <input
              autoFocus
              value={remark}
              onChange={e => setRemark(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleConfirm(); if (e.key === "Escape") setShowModal(false); }}
              placeholder={isActive ? "e.g. End of shift" : "e.g. Starting hostel duty"}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-purple-500/60 mb-4 transition-all"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50",
                  isActive
                    ? "bg-slate-700 hover:bg-slate-600 text-white"
                    : "bg-green-600 hover:bg-green-500 text-white",
                )}
              >
                {isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : isActive ? "Go Inactive" : "Go Active"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Layout({
  page, setPage, children,
}: {
  page: Page;
  setPage: (p: Page) => void;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role || "";
  const visibleNav = NAV.filter((n) => !n.roles || n.roles.includes(role));

  function NavItem({ item }: { item: typeof NAV[0] }) {
    const active = page === item.id;
    return (
      <button
        onClick={() => { setPage(item.id); setMobileOpen(false); }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
          active
            ? "bg-purple-600/20 text-purple-400 border border-purple-500/30"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent",
        )}
      >
        <item.icon size={18} className={active ? "text-purple-400" : "text-slate-500 group-hover:text-slate-300"} />
        {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
        {!collapsed && active && <ChevronRight size={14} className="text-purple-500" />}
      </button>
    );
  }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn(
      "flex flex-col h-full bg-[#0d0d10] border-r border-white/8",
      !mobile && (collapsed ? "w-16" : "w-60"),
      mobile && "w-72",
    )}>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/8">
        <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <GraduationCap size={16} className="text-white" />
        </div>
        {(!collapsed || mobile) && (
          <div>
            <p className="text-sm font-bold text-white leading-tight">CampusOps</p>
            <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">Admin Portal</p>
          </div>
        )}
        {!mobile && (
          <button onClick={() => setCollapsed((c) => !c)} className="ml-auto text-slate-500 hover:text-white transition-colors">
            {collapsed ? <ChevronRight size={16} /> : <Menu size={16} />}
          </button>
        )}
        {mobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-slate-500 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {visibleNav.map((item) => <NavItem key={item.id} item={item} />)}
      </nav>

      <div className="p-3 border-t border-white/8 space-y-2">
        <ActiveStatusButton collapsed={collapsed && !mobile} />

        <div className={cn("flex items-center gap-3", collapsed && !mobile && "justify-center")}>
          <div className="w-8 h-8 bg-purple-600/30 rounded-full flex items-center justify-center flex-shrink-0 border border-purple-500/30">
            <span className="text-purple-400 text-xs font-bold">
              {(user?.name || "A")[0].toUpperCase()}
            </span>
          </div>
          {(!collapsed || mobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500 truncate capitalize">{user?.role}</p>
            </div>
          )}
          {(!collapsed || mobile) && (
            <button onClick={logout} className="text-slate-500 hover:text-red-400 transition-colors" title="Logout">
              <LogOut size={15} />
            </button>
          )}
        </div>
        {(!collapsed || mobile) && (
          <p className="text-[9px] text-slate-700 text-center leading-tight">
            Made with ♥ by <span className="text-slate-500">Kartik Chilkoti</span>
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f0f11]">
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <div className="relative flex-shrink-0"><Sidebar mobile /></div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8 bg-[#0d0d10] md:hidden">
          <button onClick={() => setMobileOpen(true)} className="text-slate-400 hover:text-white">
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-white">CampusOps Admin</span>
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
