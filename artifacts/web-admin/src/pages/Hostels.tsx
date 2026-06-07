import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PageHeader, EmptyState, Spinner, Badge, RoleBadge, Modal } from "@/components/ui";
import {
  Building2, Users, UserCog, CheckCircle, XCircle,
  UtensilsCrossed, ChevronRight, Home, Phone,
  UserPlus, X, Search, Save, Pencil,
} from "lucide-react";

// ─── Assign Student Panel ─────────────────────────────────────────────────────
function AssignStudentPanel({
  hostel, allStudents, onClose, onAssigned,
}: { hostel: any; allStudents: any[]; onClose: () => void; onAssigned: () => void }) {
  const [search, setSearch] = useState("");
  const [roomInput, setRoomInput] = useState<Record<string, string>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unassigned = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStudents
      .filter((s) => s.hostelId !== hostel.id)
      .filter((s) => !q || [s.name, s.rollNumber, s.email].some((v) => (v || "").toLowerCase().includes(q)));
  }, [allStudents, hostel.id, search]);

  async function assign(student: any) {
    setAssigning(student.id);
    setError(null);
    try {
      await apiFetch(`/students/${student.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hostelId: hostel.id, roomNumber: roomInput[student.id]?.trim() || null }),
      });
      onAssigned();
    } catch (e: any) {
      setError(e?.message || "Failed to assign");
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <UserPlus size={12} className="text-purple-400" /> Assign Student to {hostel.name}
        </p>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
          <X size={14} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, roll number, email…"
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
          autoFocus
        />
      </div>
      {unassigned.length === 0 ? (
        <p className="text-xs text-slate-600 italic py-3 text-center">
          {search ? "No students match your search" : "All students are already in this hostel"}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
          {unassigned.slice(0, 80).map((s) => (
            <div key={s.id} className="flex items-center gap-2 bg-white/3 border border-white/6 rounded-xl px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-purple-600/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-400 text-[10px] font-bold">{(s.name || "?")[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {s.rollNumber || s.email || "—"}
                  {s.hostelName ? <span className="text-slate-600"> · {s.hostelName}</span> : ""}
                </p>
              </div>
              <input
                value={roomInput[s.id] ?? ""}
                onChange={(e) => setRoomInput((r) => ({ ...r, [s.id]: e.target.value }))}
                placeholder="Room #"
                className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={() => assign(s)}
                disabled={!!assigning}
                className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {assigning === s.id ? <Spinner size={9} /> : <Save size={9} />}
                Assign
              </button>
            </div>
          ))}
          {unassigned.length > 80 && (
            <p className="text-[10px] text-slate-600 text-center pt-1">Showing 80 — search to narrow down</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Assign Staff Panel ───────────────────────────────────────────────────────
function AssignStaffPanel({
  hostel, allStaff, hostelStaff, onClose, onAssigned,
}: { hostel: any; allStaff: any[]; hostelStaff: any[]; onClose: () => void; onAssigned: () => void }) {
  const [search, setSearch] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assignedIds = new Set(hostelStaff.map((s: any) => s.id));

  const eligible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStaff
      .filter((s) => !assignedIds.has(s.id))
      .filter((s) => !q || [s.name, s.email, s.role].some((v) => (v || "").toLowerCase().includes(q)));
  }, [allStaff, assignedIds, search]);

  async function assignStaff(staff: any) {
    setAssigning(staff.id);
    setError(null);
    try {
      const existing: string[] = Array.isArray(staff.assignedHostelIds) ? staff.assignedHostelIds : [];
      const newIds = Array.from(new Set([...existing, hostel.id]));
      await apiFetch(`/staff/${staff.id}/hostel`, {
        method: "PATCH",
        body: JSON.stringify({ hostelId: staff.hostelId || hostel.id, assignedHostelIds: newIds }),
      });
      onAssigned();
    } catch (e: any) {
      setError(e?.message || "Failed to assign");
    } finally {
      setAssigning(null);
    }
  }

  async function removeStaff(staff: any) {
    setAssigning(staff.id);
    setError(null);
    try {
      const existing: string[] = Array.isArray(staff.assignedHostelIds) ? staff.assignedHostelIds : [];
      const newIds = existing.filter((id) => id !== hostel.id);
      const newHostelId = staff.hostelId === hostel.id ? (newIds[0] || null) : staff.hostelId;
      await apiFetch(`/staff/${staff.id}/hostel`, {
        method: "PATCH",
        body: JSON.stringify({ hostelId: newHostelId, assignedHostelIds: newIds }),
      });
      onAssigned();
    } catch (e: any) {
      setError(e?.message || "Failed to remove");
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <UserCog size={12} className="text-blue-400" /> Assign Staff to {hostel.name}
        </p>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
          <X size={14} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {/* Currently assigned — can remove */}
      {hostelStaff.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5">Currently Assigned</p>
          <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
            {hostelStaff.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 bg-white/3 border border-white/6 rounded-xl px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-400 text-[10px] font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                  <div className="flex items-center gap-1 mt-0.5"><RoleBadge role={s.role} /></div>
                </div>
                <button
                  onClick={() => removeStaff(s)}
                  disabled={!!assigning}
                  className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {assigning === s.id ? <Spinner size={9} /> : <X size={9} />}
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and add new staff */}
      <div>
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-1.5">Add Staff</p>
        <div className="relative mb-2">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff by name, email, role…"
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            autoFocus
          />
        </div>
        {eligible.length === 0 ? (
          <p className="text-xs text-slate-600 italic py-2 text-center">
            {search ? "No staff match your search" : "All staff are already assigned"}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
            {eligible.slice(0, 50).map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-white/3 border border-white/6 rounded-xl px-3 py-2">
                <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-400 text-[10px] font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{s.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <RoleBadge role={s.role} />
                    {s.hostelName && <span className="text-[10px] text-slate-600">· {s.hostelName}</span>}
                  </div>
                </div>
                <button
                  onClick={() => assignStaff(s)}
                  disabled={!!assigning}
                  className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  {assigning === s.id ? <Spinner size={9} /> : <Save size={9} />}
                  Assign
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit Room / Unassign Modal ───────────────────────────────────────────────
function EditRoomModal({ student, hostelId, onClose, onSaved }: {
  student: any; hostelId: string; onClose: () => void; onSaved: () => void;
}) {
  const [room, setRoom] = useState(student.roomNumber || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/students/${student.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hostelId, roomNumber: room.trim() || null }),
      });
      onSaved();
      onClose();
    } catch (e: any) { setError(e?.message || "Failed"); }
    finally { setSaving(false); }
  }

  async function unassign() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/students/${student.id}`, {
        method: "PATCH",
        body: JSON.stringify({ hostelId: null, roomNumber: null }),
      });
      onSaved();
      onClose();
    } catch (e: any) { setError(e?.message || "Failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-[#1a1a2e] border border-white/12 rounded-2xl p-5 w-72 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-white">Edit Assignment</p>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-3 truncate">{student.name}</p>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <label className="text-xs text-slate-500 mb-1 block">Room Number</label>
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="e.g. A-204"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/50 mb-4"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        <div className="flex gap-2">
          <button
            onClick={save} disabled={saving}
            className="flex-1 flex items-center justify-center gap-1 text-xs px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 rounded-lg transition-all disabled:opacity-50"
          >
            {saving ? <Spinner size={11} /> : <Save size={11} />} Save
          </button>
          <button
            onClick={unassign} disabled={saving}
            className="flex-1 flex items-center justify-center gap-1 text-xs px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all disabled:opacity-50"
          >
            <X size={11} /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Hostels() {
  const qc = useQueryClient();
  const [selectedHostel, setSelectedHostel] = useState<any>(null);
  const [assignMode, setAssignMode] = useState<null | "student" | "staff">(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [editingStudent, setEditingStudent] = useState<any | null>(null);

  const { data: hostels = [], isLoading } = useQuery({
    queryKey: ["hostels-detail"],
    queryFn: () => apiFetch<any[]>("/hostels"),
    refetchInterval: 30000,
  });

  const { data: studentsData, refetch: refetchStudents } = useQuery({
    queryKey: ["students"],
    queryFn: () => apiFetch<{ students: any[]; total: number }>("/students?limit=5000"),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const studentList: any[] = studentsData?.students ?? [];

  const { data: allStaff = [], refetch: refetchStaff } = useQuery({
    queryKey: ["all-staff"],
    queryFn: () => apiFetch<any[]>("/staff/all"),
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: activeList = [] } = useQuery({
    queryKey: ["active-staff"],
    queryFn: () => apiFetch<any[]>("/staff/active-list"),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: inventoryData = [] } = useQuery({
    queryKey: ["attendance", selectedHostel?.id],
    queryFn: () =>
      selectedHostel ? apiFetch<any[]>(`/attendance?hostelId=${selectedHostel.id}`) : Promise.resolve([]),
    enabled: !!selectedHostel,
    refetchInterval: 20000,
    staleTime: 15000,
  });

  const activeIds = new Set((activeList as any[]).map((s: any) => s.id));

  const hostelCountMap: Record<string, number> = {};
  studentList.forEach((s: any) => {
    if (s.hostelId) hostelCountMap[s.hostelId] = (hostelCountMap[s.hostelId] || 0) + 1;
  });

  function getHostelStaff(hostelId: string) {
    return (allStaff as any[]).filter((s: any) => {
      if (s.hostelId === hostelId) return true;
      try {
        const ids = JSON.parse(typeof s.assignedHostelIds === "string" ? s.assignedHostelIds : JSON.stringify(s.assignedHostelIds || "[]"));
        return Array.isArray(ids) && ids.includes(hostelId);
      } catch { return false; }
    });
  }

  function getHostelStudents(hostelId: string) {
    return studentList.filter((s: any) => s.hostelId === hostelId);
  }

  const hostelStudents = selectedHostel ? getHostelStudents(selectedHostel.id) : [];
  const hostelStaff = selectedHostel ? getHostelStaff(selectedHostel.id) : [];

  const inventoryMap: Record<string, any> = {};
  (inventoryData as any[]).forEach((s: any) => { inventoryMap[s.id] = s; });

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return hostelStudents;
    return hostelStudents.filter((s: any) =>
      [s.name, s.rollNumber, s.roomNumber].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [hostelStudents, studentSearch]);

  function closeModal() {
    setSelectedHostel(null);
    setAssignMode(null);
    setStudentSearch("");
    setEditingStudent(null);
  }

  function refresh() {
    refetchStudents();
    refetchStaff();
    setAssignMode(null);
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Hostels"
        subtitle={`${(hostels as any[]).length} hostels · live sync · click to view details`}
        action={
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/8 border border-green-500/15 rounded-xl">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-green-400 font-medium">Live</span>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size={24} /></div>
      ) : (hostels as any[]).length === 0 ? (
        <EmptyState icon={Building2} title="No hostels found" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(hostels as any[]).map((h: any) => {
            const count = hostelCountMap[h.id] || 0;
            const staff = getHostelStaff(h.id);
            const pct = h.capacity ? Math.round((count / h.capacity) * 100) : 0;
            const onlineStaff = staff.filter((s: any) => activeIds.has(s.id)).length;

            return (
              <button
                key={h.id}
                onClick={() => { setSelectedHostel(h); setAssignMode(null); setStudentSearch(""); }}
                className="text-left w-full p-5 rounded-2xl bg-[#161620] border border-white/8 hover:border-purple-500/40 hover:bg-purple-600/5 transition-all group"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-600/20 border border-purple-500/30 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-purple-600/30 transition-colors">
                    <Building2 size={18} className="text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white truncate">{h.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{h.description || "IIT Madras BS Hostel"}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 group-hover:text-purple-400 transition-colors flex-shrink-0 mt-0.5" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 flex items-center gap-1"><Users size={11} /> Students</span>
                    <span className="text-white font-semibold">{count}{h.capacity ? ` / ${h.capacity}` : ""}</span>
                  </div>
                  {h.capacity && (
                    <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500 flex items-center gap-1"><UserCog size={11} /> Staff assigned</span>
                    <span className="text-white font-semibold">
                      {staff.length}
                      {onlineStaff > 0 && <span className="ml-1.5 text-green-400">· {onlineStaff} online</span>}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Hostel Detail Modal */}
      <Modal open={!!selectedHostel} onClose={closeModal} title={selectedHostel?.name || "Hostel Details"} width="max-w-3xl">
        {selectedHostel && (
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            {/* Header stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Students", value: hostelStudents.length, icon: Users, color: "text-purple-400" },
                { label: "Staff", value: hostelStaff.length, icon: UserCog, color: "text-blue-400" },
                { label: "Online Now", value: hostelStaff.filter((s: any) => activeIds.has(s.id)).length, icon: CheckCircle, color: "text-green-400" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
                  <Icon size={16} className={`${color} mx-auto mb-1`} />
                  <p className="text-lg font-bold text-white">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            {/* Staff section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <UserCog size={12} /> Staff ({hostelStaff.length})
                </h4>
                <button
                  onClick={() => setAssignMode(assignMode === "staff" ? null : "staff")}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-all ${assignMode === "staff" ? "bg-blue-600/20 text-blue-300 border-blue-500/40" : "bg-white/5 hover:bg-blue-600/15 text-slate-400 hover:text-blue-400 border-white/10 hover:border-blue-500/30"}`}
                >
                  <UserPlus size={11} />
                  {assignMode === "staff" ? "Cancel" : "Manage Staff"}
                </button>
              </div>

              {assignMode === "staff" ? (
                <AssignStaffPanel
                  hostel={selectedHostel}
                  allStaff={allStaff as any[]}
                  hostelStaff={hostelStaff}
                  onClose={() => setAssignMode(null)}
                  onAssigned={refresh}
                />
              ) : hostelStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <p className="text-sm text-slate-600 italic">No staff assigned</p>
                  <button onClick={() => setAssignMode("staff")} className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline">
                    Assign a volunteer or admin
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {hostelStaff.map((s: any) => {
                    const online = activeIds.has(s.id);
                    return (
                      <div key={s.id} className="flex items-center gap-3 bg-white/3 border border-white/6 rounded-xl p-3">
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                            <span className="text-blue-400 text-xs font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161620] ${online ? "bg-green-400" : "bg-slate-600"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <RoleBadge role={s.role} />
                            {s.email && <span className="text-[10px] text-slate-600 truncate">{s.email}</span>}
                          </div>
                        </div>
                        <div className="flex items-center">
                          {online
                            ? <span className="text-xs text-green-400 font-medium flex items-center gap-0.5"><CheckCircle size={11} /> Active</span>
                            : <span className="text-xs text-slate-600 flex items-center gap-0.5"><XCircle size={11} /> Offline</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-white/6" />

            {/* Students section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Users size={12} /> Students ({hostelStudents.length})
                </h4>
                <button
                  onClick={() => setAssignMode(assignMode === "student" ? null : "student")}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 border rounded-lg transition-all ${assignMode === "student" ? "bg-purple-600/20 text-purple-300 border-purple-500/40" : "bg-white/5 hover:bg-purple-600/15 text-slate-400 hover:text-purple-400 border-white/10 hover:border-purple-500/30"}`}
                >
                  <UserPlus size={11} />
                  {assignMode === "student" ? "Cancel" : "Assign Student"}
                </button>
              </div>

              {assignMode === "student" ? (
                <AssignStudentPanel
                  hostel={selectedHostel}
                  allStudents={studentList}
                  onClose={() => setAssignMode(null)}
                  onAssigned={refresh}
                />
              ) : (
                <>
                  {hostelStudents.length > 5 && (
                    <div className="relative mb-2">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Search students…"
                        className="w-full bg-white/5 border border-white/8 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/40"
                      />
                    </div>
                  )}

                  {hostelStudents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4 text-center">
                      <p className="text-sm text-slate-600 italic">No students assigned</p>
                      <button onClick={() => setAssignMode("student")} className="mt-2 text-xs text-purple-400 hover:text-purple-300 underline">
                        Assign a student
                      </button>
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <p className="text-sm text-slate-600 italic py-2">No students match your search</p>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredStudents.map((s: any) => {
                        const inv = inventoryMap[s.id];
                        const messCard = inv?.messCard ?? s.messCard;
                        const status = s.attendanceStatus;
                        return (
                          <div key={s.id} className="flex items-center gap-3 bg-white/3 border border-white/5 rounded-xl px-3 py-2.5 group">
                            <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-purple-400 text-xs font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {s.rollNumber && <span className="text-xs text-slate-500">{s.rollNumber}</span>}
                                {s.roomNumber && (
                                  <span className="text-xs text-slate-500 flex items-center gap-0.5">
                                    <Home size={9} /> {s.roomNumber}
                                  </span>
                                )}
                                {(s.phone || s.contactNumber) && (
                                  <span className="text-xs text-slate-500 flex items-center gap-0.5">
                                    <Phone size={9} /> {s.phone || s.contactNumber}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <Badge
                                label={status === "entered" ? "In Campus" : status === "exited" ? "Out" : "Away"}
                                color={status === "entered" ? "green" : status === "exited" ? "blue" : "gray"}
                              />
                              <span className={`text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 ${messCard ? "bg-orange-500/15 text-orange-400 border border-orange-500/20" : "bg-white/5 text-slate-600 border border-white/8"}`}>
                                <UtensilsCrossed size={9} />
                                {messCard ? "Card" : "No Card"}
                              </span>
                              <button
                                onClick={() => setEditingStudent(s)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300"
                                title="Edit room / remove"
                              >
                                <Pencil size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Edit room / unassign floating modal */}
      {editingStudent && selectedHostel && (
        <EditRoomModal
          student={editingStudent}
          hostelId={selectedHostel.id}
          onClose={() => setEditingStudent(null)}
          onSaved={() => { refetchStudents(); setEditingStudent(null); }}
        />
      )}
    </div>
  );
}
