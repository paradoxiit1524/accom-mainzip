import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { PageHeader, Card, Button, Spinner } from "@/components/ui";
import { BarChart3, Download, FileText, Users, ClipboardCheck, Activity, Package } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#7c3aed", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

const EXPORTS = [
  { label: "Students CSV", icon: Users, path: "/export/students.csv", file: "students.csv", color: "purple" },
  { label: "Inventory CSV", icon: Package, path: "/export/inventory.csv", file: "inventory.csv", color: "green" },
  { label: "Activity Logs CSV", icon: Activity, path: "/export/timelogs", file: "activity-logs.csv", color: "blue" },
  { label: "Full Report CSV", icon: BarChart3, path: "/export/full-report.csv", file: "full-report.csv", color: "yellow" },
];

const PDF_EXPORTS = [
  { label: "Students PDF", icon: FileText, path: "/pdf/students", file: "students.pdf" },
  { label: "Activity Logs PDF", icon: FileText, path: "/pdf/activity-logs", file: "activity-logs.pdf" },
  { label: "Full Report PDF", icon: FileText, path: "/pdf/full-report", file: "full-report.pdf" },
];

export default function Reports() {
  const [attDate, setAttDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: summary } = useQuery({ queryKey: ["reports-summary"], queryFn: () => apiFetch<any>("/reports/summary"), refetchInterval: 30000 });
  const { data: hostels = [] } = useQuery({ queryKey: ["hostels"], queryFn: () => apiFetch<any[]>("/hostels"), refetchInterval: 60000 });
  const { data: studentsData } = useQuery({ queryKey: ["students"], queryFn: () => apiFetch<{ students: any[]; total: number }>("/students?limit=5000"), refetchInterval: 60000 });
  const students: any[] = studentsData?.students ?? [];
  const { data: attStats } = useQuery({ queryKey: ["att-stats"], queryFn: () => apiFetch<any>("/attendance/stats"), refetchInterval: 30000 });

  const hostelCountMap: Record<string, number> = {};
  students.forEach((s: any) => { if (s.hostelId) hostelCountMap[s.hostelId] = (hostelCountMap[s.hostelId] || 0) + 1; });

  const hostelBar = (hostels as any[]).slice(0, 10).map((h: any) => ({
    name: h.name?.substring(0, 8) || h.id,
    students: hostelCountMap[h.id] || h.studentCount || 0,
  }));

  const messMap: Record<string, number> = {};
  students.forEach((s: any) => { if (s.assignedMess) messMap[s.assignedMess] = (messMap[s.assignedMess] || 0) + 1; });
  const messPie = Object.entries(messMap).map(([name, value]) => ({ name, value }));

  const attPie = [
    { name: "In Campus", value: attStats?.inCampus || 0 },
    { name: "Checked Out", value: attStats?.checkedOut || 0 },
    { name: "Pending", value: attStats?.pending || 0 },
  ].filter((d) => d.value > 0);

  return (
    <div className="fade-in space-y-6">
      <PageHeader title="Reports" subtitle="Analytics, insights, and data exports" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Students", value: summary?.totalStudents || (students as any[]).length },
          { label: "Hostels", value: summary?.totalHostels || (hostels as any[]).length },
          { label: "In Campus", value: attStats?.inCampus || 0 },
          { label: "Announcements", value: summary?.totalAnnouncements || 0 },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4 text-center">
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-4">Students by Hostel</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hostelBar} barSize={22}>
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }} itemStyle={{ color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
              <Bar dataKey="students" radius={[4, 4, 0, 0]}>
                {hostelBar.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-4">Attendance Status (Today)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={attPie} cx="50%" cy="50%" outerRadius={80} innerRadius={50} paddingAngle={3} dataKey="value">
                {attPie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }} itemStyle={{ color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {messPie.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-4">Mess Distribution</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={messPie} barSize={32}>
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }} itemStyle={{ color: "#e2e8f0" }} labelStyle={{ color: "#94a3b8" }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            <Download size={14} className="text-green-400" /> CSV Exports
          </h2>
          <div className="space-y-2">
            {EXPORTS.map((exp) => (
              <div key={exp.file} className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-white/6 hover:bg-white/6 transition-all">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <exp.icon size={15} className="text-slate-400" />
                </div>
                <span className="text-sm text-slate-300 flex-1">{exp.label}</span>
                <Button size="sm" variant="secondary" onClick={() => downloadFile(exp.path, exp.file)}>
                  <Download size={12} /> Download
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-white/6">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <ClipboardCheck size={15} className="text-slate-400" />
              </div>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-sm text-slate-300">Attendance CSV</span>
                <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none" />
              </div>
              <Button size="sm" variant="secondary" onClick={() => downloadFile(`/export/attendance.csv?date=${attDate}`, `attendance-${attDate}.csv`)}>
                <Download size={12} /> Download
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
            <FileText size={14} className="text-red-400" /> PDF Reports
          </h2>
          <div className="space-y-2">
            {PDF_EXPORTS.map((exp) => (
              <div key={exp.file} className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-white/6 hover:bg-white/6 transition-all">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <exp.icon size={15} className="text-red-400" />
                </div>
                <span className="text-sm text-slate-300 flex-1">{exp.label}</span>
                <Button size="sm" variant="secondary" onClick={() => downloadFile(exp.path, exp.file)}>
                  <Download size={12} /> PDF
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-white/6">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <FileText size={15} className="text-red-400" />
              </div>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-sm text-slate-300">Attendance PDF</span>
                <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none" />
              </div>
              <Button size="sm" variant="secondary" onClick={() => downloadFile(`/pdf/attendance?date=${attDate}`, `attendance-${attDate}.pdf`)}>
                <Download size={12} /> PDF
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
