import React, { useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { StatCard, Card, Spinner, Badge } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { formatNote } from "@/pages/ActivityLogs";
import {
  Users, Building2, ClipboardCheck, Activity, UserCheck,
  LogIn, Clock, AlertTriangle, TrendingUp, Globe,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#7c3aed", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#6366f1", "#10b981"];

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit" });
}

function useHighlight(value: any) {
  const [highlight, setHighlight] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== undefined && JSON.stringify(prev.current) !== JSON.stringify(value)) {
      setHighlight(true);
      const t = setTimeout(() => setHighlight(false), 2000);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return highlight;
}

function NoHostelEmpty() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center mb-4">
        <AlertTriangle size={28} className="text-yellow-400" />
      </div>
      <h2 className="text-lg font-bold text-slate-200 mb-2">No Hostel Assigned</h2>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
        You haven't been assigned to any hostel yet. Your dashboard will show data once a Super Admin assigns you to one.
      </p>
      <div className="mt-4 px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
        <p className="text-xs text-yellow-400">Contact your Super Admin to get assigned</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superadmin";
  const isScoped = !isSuperAdmin;

  const assignedIds: string[] = (() => {
    if (!user) return [];
    if (isSuperAdmin) return [];
    try {
      const parsed = JSON.parse((user as any).assignedHostelIds || "[]");
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
    return user.hostelId ? [user.hostelId] : [];
  })();

  const hasHostel = isSuperAdmin || assignedIds.length > 0;

  const { data: summary, dataUpdatedAt: summaryUpdated } = useQuery({
    queryKey: ["reports-summary"],
    queryFn: () => apiFetch<any>("/reports/summary"),
    refetchInterval: 15000,
    staleTime: 12000,
    enabled: hasHostel,
  });

  const { data: attStats, dataUpdatedAt: attUpdated } = useQuery({
    queryKey: ["att-stats"],
    queryFn: () => apiFetch<any>("/attendance/stats"),
    refetchInterval: 8000,
    staleTime: 6000,
    enabled: hasHostel,
  });

  const { data: activeStaff, dataUpdatedAt: staffUpdated } = useQuery({
    queryKey: ["active-staff"],
    queryFn: () => apiFetch<any[]>("/staff/active-list"),
    refetchInterval: 8000,
    staleTime: 6000,
    enabled: hasHostel,
  });

  const { data: allStaff } = useQuery({
    queryKey: ["all-staff"],
    queryFn: () => apiFetch<any[]>("/staff/all"),
    refetchInterval: 15000,
    staleTime: 12000,
    enabled: hasHostel,
  });

  const { data: hostels } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => apiFetch<any[]>("/hostels"),
    staleTime: 60000,
    refetchInterval: 60000,
    enabled: hasHostel,
  });

  const { data: recentLogs, dataUpdatedAt: logsUpdated } = useQuery({
    queryKey: ["timelogs-today"],
    queryFn: () => apiFetch<any[]>("/timelogs/today"),
    refetchInterval: 20000,
    staleTime: 15000,
    enabled: hasHostel,
  });

  const summaryHighlight = useHighlight(summary?.totalStudents);
  const attHighlight = useHighlight(attStats?.inCampus);
  const staffHighlight = useHighlight((activeStaff || []).length);
  const logsHighlight = useHighlight((recentLogs || []).length);

  if (!hasHostel) {
    return <NoHostelEmpty />;
  }

  const scopedHostels = isSuperAdmin
    ? (hostels || [])
    : (hostels || []).filter((h: any) => assignedIds.includes(h.id));

  const hostelBarData = (scopedHostels as any[]).slice(0, 8).map((h: any) => ({
    name: h.name?.split(" ")[0] || h.id,
    students: h.studentCount || h.capacity || 0,
  }));

  const staffOnline = (activeStaff || []).length;
  const staffTotal = (allStaff || []).length;

  const pieData = [
    { name: "Checked In", value: attStats?.inCampus || 0 },
    { name: "Checked Out", value: attStats?.checkedOut || 0 },
    { name: "Pending", value: attStats?.pending || 0 },
  ].filter((d) => d.value > 0);

  const highlightClass = "transition-all duration-500";
  const glowClass = "ring-2 ring-purple-400/40 shadow-lg shadow-purple-500/20";

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/25 rounded-xl">
              <Globe size={12} className="text-purple-400" />
              <span className="text-xs text-purple-400 font-semibold">Global View</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/25 rounded-xl">
              <Building2 size={12} className="text-blue-400" />
              <span className="text-xs text-blue-400 font-semibold">{assignedIds.length} Hostel{assignedIds.length > 1 ? "s" : ""}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-green-500/8 border border-green-500/15 rounded-xl">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-green-400">Live</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${highlightClass} ${summaryHighlight ? glowClass : ""} rounded-2xl`}>
          <StatCard
            label="Total Students"
            value={summary?.totalStudents ?? "—"}
            icon={Users}
            color="bg-purple-600"
            sub={`Across ${summary?.totalHostels ?? 0} hostel${(summary?.totalHostels ?? 0) !== 1 ? "s" : ""}`}
          />
        </div>
        <div className={`${highlightClass} ${attHighlight ? glowClass : ""} rounded-2xl`}>
          <StatCard
            label="In Campus Today"
            value={attStats?.inCampus ?? "—"}
            icon={UserCheck}
            color="bg-green-600"
            sub={`Checked out: ${attStats?.checkedOut ?? 0}`}
          />
        </div>
        <div className={`${highlightClass} ${staffHighlight ? glowClass : ""} rounded-2xl`}>
          <StatCard
            label="Staff Online"
            value={`${staffOnline}/${staffTotal}`}
            icon={Activity}
            color="bg-blue-600"
            sub="Active in last 10 min"
          />
        </div>
        <StatCard
          label="Pending Check-in"
          value={attStats?.pending ?? "—"}
          icon={Clock}
          color="bg-yellow-600"
          sub="Not checked in today"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className={`lg:col-span-2 p-5 ${highlightClass} ${summaryHighlight ? glowClass : ""}`}>
          <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            <Building2 size={15} className="text-purple-400" />
            {isSuperAdmin ? "Students by Hostel (All)" : `Students — ${assignedIds.length} Hostel${assignedIds.length > 1 ? "s" : ""}`}
          </h2>
          {hostelBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hostelBarData} barSize={20}>
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#e2e8f0" }}
                />
                <Bar dataKey="students" radius={[4, 4, 0, 0]}>
                  {hostelBarData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-600 text-sm">Loading…</div>
          )}
        </Card>

        <Card className={`p-5 ${highlightClass} ${attHighlight ? glowClass : ""}`}>
          <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            <ClipboardCheck size={15} className="text-green-400" /> Today's Attendance
          </h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }} itemStyle={{ color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center">
              <div className="text-center">
                <p className="text-4xl font-bold text-purple-400">{attStats?.inCampus ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">In Campus</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className={`p-5 ${highlightClass} ${staffHighlight ? glowClass : ""}`}>
          <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <Activity size={15} className="text-blue-400" /> Active Staff ({staffOnline})
          </h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(activeStaff || []).length === 0 ? (
              <p className="text-slate-600 text-sm py-4 text-center">No staff currently active</p>
            ) : (
              (activeStaff || []).map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/3 border border-white/6">
                  <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{s.name || s.email}</p>
                    <p className="text-xs text-slate-500 truncate">{s.remark || s.role}</p>
                  </div>
                  <Badge label={s.role} color="blue" />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className={`p-5 ${highlightClass} ${logsHighlight ? glowClass : ""}`}>
          <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <LogIn size={15} className="text-purple-400" /> Recent Activity
          </h2>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(recentLogs || []).length === 0 ? (
              <p className="text-slate-600 text-sm py-4 text-center">No activity today</p>
            ) : (
              (recentLogs || []).slice(0, 10).map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-white/3 border border-white/6">
                  <div className="w-6 h-6 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Activity size={11} className="text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate">{log.userName || log.userId}</p>
                    <p className="text-xs text-slate-500 line-clamp-2">{formatNote(log.note, log.type) || log.type}</p>
                  </div>
                  <p className="text-[10px] text-slate-600 whitespace-nowrap">
                    {log.createdAt ? fmt(log.createdAt) : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {summary && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <TrendingUp size={15} className="text-green-400" /> System Stats
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Announcements", value: summary?.totalAnnouncements },
              { label: "Lost Items", value: summary?.totalLostItems },
              { label: "Hostels", value: summary?.totalHostels },
              { label: "Staff Members", value: staffTotal },
            ].map((s) => (
              <div key={s.label} className="text-center p-3 bg-white/3 rounded-xl border border-white/6">
                <p className="text-xl font-bold text-white">{s.value ?? "—"}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
