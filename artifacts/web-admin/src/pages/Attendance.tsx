import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card, Table, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import { ClipboardCheck, Download, RefreshCw, CheckCircle, XCircle, UserPlus, Search, X, Calendar, CalendarDays } from "lucide-react";

import { format } from "date-fns";

const COORD_UP = ["coordinator", "admin", "superadmin"];

function fmt(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" });
}

function CheckInModal({ visible, onClose, hostels, onSuccess }: { visible: boolean; onClose: () => void; hostels: any[]; onSuccess: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [hostelFilter, setHostelFilter] = useState("");
  const [checking, setChecking] = useState<string | null>(null);
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());

  const { data: students = [], isLoading } = useQuery<any[]>({
    queryKey: ["checkin-search", search, hostelFilter],
    queryFn: () => apiFetch<any[]>(`/students?search=${encodeURIComponent(search)}&limit=30${hostelFilter ? `&hostelId=${hostelFilter}` : ""}`).then(r => Array.isArray(r) ? r : (r as any).students || []),
    enabled: search.trim().length >= 2,
    staleTime: 5000,
  });

  const checkInMut = useMutation({
    mutationFn: (studentId: string) => apiFetch(`/checkins/${studentId}`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (_data, studentId) => {
      setSuccessIds(prev => new Set([...prev, studentId]));
      qc.invalidateQueries({ queryKey: ["checkins"] });
      onSuccess();
    },
  });

  async function handleCheckIn(studentId: string) {
    setChecking(studentId);
    try {
      await checkInMut.mutateAsync(studentId);
    } catch {}
    setChecking(null);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-[#0f0f13] border border-white/10 rounded-2xl w-full max-w-lg mx-4 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white">Check In Student</h2>
            <p className="text-xs text-slate-500">Search and mark a student as checked in</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, roll, or email…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-500/60 transition-all"
              autoFocus
            />
          </div>
          <select
            value={hostelFilter}
            onChange={e => setHostelFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-purple-500/60 transition-all"
          >
            <option value="">All Hostels</option>
            {hostels.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-xl border border-white/8 divide-y divide-white/5">
          {search.trim().length < 2 ? (
            <div className="py-8 text-center text-slate-500 text-sm">Type at least 2 characters to search</div>
          ) : isLoading ? (
            <div className="py-8 flex justify-center"><Spinner size={20} /></div>
          ) : students.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">No students found</div>
          ) : (
            students.map((s: any) => {
              const isSuccess = successIds.has(s.id);
              const isChecking = checking === s.id;
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-400 text-xs font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{s.name}</p>
                    <p className="text-xs text-slate-500 truncate">{s.rollNumber || s.email} {s.roomNumber ? `· Room ${s.roomNumber}` : ""}</p>
                    <p className="text-xs text-slate-600 truncate">{s.hostelName || "—"}</p>
                  </div>
                  <button
                    onClick={() => handleCheckIn(s.id)}
                    disabled={isChecking || isSuccess}
                    className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all disabled:opacity-60 ${
                      isSuccess
                        ? "bg-green-500/15 text-green-400 border-green-500/25"
                        : "bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border-purple-500/30"
                    }`}
                  >
                    {isChecking ? <Spinner size={12} /> : isSuccess ? "✓ Checked In" : "Check In"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function Attendance() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isRestricted = !COORD_UP.includes(user?.role || "");
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [allDates, setAllDates] = useState(false);
  const [hostelFilter, setHostelFilter] = useState(isRestricted ? (user?.hostelId || "") : "");
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);

  const { data: hostels = [] } = useQuery({ queryKey: ["hostels"], queryFn: () => apiFetch<any[]>("/hostels") });
  const { data: checkins = [], isLoading, refetch } = useQuery({
    queryKey: ["checkins", allDates ? "all" : date, hostelFilter],
    queryFn: () => apiFetch<any[]>(`/checkins?date=${allDates ? "all" : date}${hostelFilter ? `&hostelId=${hostelFilter}` : ""}&limit=1000`),
    refetchInterval: 15000,
  });

  const checkoutMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/checkins/${id}/checkout`, { method: "PATCH" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["checkins"] }); refetch(); },
  });
  const revokeCheckoutMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/checkins/${id}/revoke-checkout`, { method: "PATCH" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["checkins"] }); refetch(); },
  });
  const revokeCheckinMut = useMutation({
    mutationFn: (studentId: string) => apiFetch(`/checkins/${studentId}/today`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["checkins"] }); refetch(); },
  });

  const inCampus = checkins.filter((c: any) => !c.checkOutTime).length;
  const checkedOut = checkins.filter((c: any) => !!c.checkOutTime).length;

  return (
    <div className="fade-in">
      <PageHeader
        title="Attendance"
        subtitle="Check-in/out tracking for all students"
        action={
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => setCheckInModalOpen(true)}>
              <UserPlus size={14} /> Check In Student
            </Button>
            <Button variant="secondary" size="sm" onClick={() => downloadFile(`/export/attendance.csv?date=${allDates ? "" : date}`, `attendance-${allDates ? "all" : date}.csv`)}>
              <Download size={14} /> Export CSV
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "In Campus", value: inCampus, icon: CheckCircle, color: "text-green-400 bg-green-500/15" },
          { label: "Checked Out", value: checkedOut, icon: XCircle, color: "text-blue-400 bg-blue-500/15" },
          { label: "Total Records", value: checkins.length, icon: ClipboardCheck, color: "text-purple-400 bg-purple-500/15" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
          {/* Date mode toggle */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setAllDates(false)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${
                !allDates ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Calendar size={12} /> By Date
            </button>
            <button
              onClick={() => setAllDates(true)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-l border-white/10 ${
                allDates ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <CalendarDays size={12} /> All Dates
            </button>
          </div>

          {/* Date picker — only shown in "By Date" mode */}
          {!allDates && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={today}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-500/60 transition-all"
            />
          )}

          <Select value={hostelFilter} onChange={setHostelFilter} className="min-w-40" disabled={isRestricted}>
            <option value="">All Hostels</option>
            {hostels.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <span className="text-xs text-slate-500 ml-auto">{checkins.length} records</span>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : checkins.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No check-ins found" sub={allDates ? "No attendance records found" : "No attendance records for this date/hostel"} />
        ) : (
          <Table headers={["Student", "Roll", "Room", "Hostel", "Date", "Marked By", "Check In", "Check Out", "Status", "Actions"]}>
            {checkins.map((c: any) => {
              const checkedOutNow = !!c.checkOutTime;
              return (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{c.studentName || "—"}</p>
                      <p className="text-xs text-slate-500">{c.studentEmail || ""}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{c.studentRoll || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{c.studentRoom || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {hostels.find((h: any) => h.id === c.hostelId)?.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{c.date || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{c.volunteerName || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-green-400">{fmt(c.checkInTime)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${checkedOutNow ? "text-blue-400" : "text-slate-600"}`}>
                      {fmt(c.checkOutTime)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      label={checkedOutNow ? "Checked Out" : "In Campus"}
                      color={checkedOutNow ? "blue" : "green"}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {!checkedOutNow ? (
                        <button
                          onClick={() => checkoutMut.mutate(c.id)}
                          disabled={checkoutMut.isPending}
                          className="text-xs px-2.5 py-1 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/25 rounded-lg transition-all disabled:opacity-50"
                        >
                          Check Out
                        </button>
                      ) : (
                        <button
                          onClick={() => revokeCheckoutMut.mutate(c.id)}
                          disabled={revokeCheckoutMut.isPending}
                          className="text-xs px-2.5 py-1 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/25 rounded-lg transition-all disabled:opacity-50"
                        >
                          Undo Out
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm("Revoke this student's check-in?")) revokeCheckinMut.mutate(c.studentId); }}
                        disabled={revokeCheckinMut.isPending}
                        className="text-xs px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <CheckInModal
        visible={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        hostels={hostels}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ["checkins"] }); refetch(); }}
      />
    </div>
  );
}
