import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { PageHeader, Card, Table, Input, Select, Button, Modal, EmptyState, Badge } from "@/components/ui";
import { Users, Download, Search, Eye, Building2, CreditCard } from "lucide-react";

export default function Students() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [hostelFilter, setHostelFilter] = useState("");
  const [messFilter, setMessFilter] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [assignHostelId, setAssignHostelId] = useState("");
  const [assignRoom, setAssignRoom] = useState("");
  const [assignError, setAssignError] = useState("");

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: () => apiFetch<{ students: any[]; total: number }>("/students?limit=5000"),
    refetchInterval: 30000,
  });
  const students: any[] = studentsData?.students ?? [];

  const { data: hostels = [] } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => apiFetch<any[]>("/hostels"),
    refetchInterval: 60000,
  });

  const assignMut = useMutation({
    mutationFn: ({ id, hostelId, roomNumber }: { id: string; hostelId: string; roomNumber: string }) =>
      apiFetch(`/students/${id}`, { method: "PATCH", body: JSON.stringify({ hostelId: hostelId || null, roomNumber }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      setAssignTarget(null);
      setAssignError("");
    },
    onError: (e: any) => setAssignError(e.message),
  });

  const messList = [...new Set(students.map((s: any) => s.assignedMess).filter(Boolean))];

  const filtered = students.filter((s: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.name?.toLowerCase().includes(q) || s.rollNumber?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.roomNumber?.toLowerCase().includes(q) || s.messCardNo?.toLowerCase().includes(q);
    const matchHostel = !hostelFilter || s.hostelId === hostelFilter;
    const matchMess = !messFilter || s.assignedMess === messFilter;
    return matchSearch && matchHostel && matchMess;
  });

  function openAssign(s: any) {
    setAssignTarget(s);
    setAssignHostelId(s.hostelId || "");
    setAssignRoom(s.roomNumber || "");
    setAssignError("");
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Students"
        subtitle={`${filtered.length} of ${students.length} students`}
        action={
          <Button variant="secondary" size="sm" onClick={() => downloadFile("/export/students.csv", "students.csv")}>
            <Download size={14} /> Export CSV
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={setSearch} placeholder="Search name, roll, room, card no…" className="pl-9" />
          </div>
          <Select value={hostelFilter} onChange={setHostelFilter} className="min-w-36">
            <option value="">All Hostels</option>
            {(hostels as any[]).map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Select value={messFilter} onChange={setMessFilter} className="min-w-32">
            <option value="">All Mess</option>
            {messList.map((m: any) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>

        <Table
          headers={["Student", "Roll No", "Card No", "Room", "Hostel", "Mess", "Phone", "Actions"]}
          loading={isLoading}
          empty={filtered.length === 0 ? "No students found" : undefined}
        >
          {filtered.map((s: any) => (
            <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-400 text-xs font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-slate-400">{s.rollNumber || "—"}</td>
              <td className="px-4 py-3">
                {s.messCardNo ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-bold tracking-wider">
                    <CreditCard size={11} />
                    {s.messCardNo}
                  </span>
                ) : <span className="text-slate-600 text-sm">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-slate-400">{s.roomNumber || "—"}</td>
              <td className="px-4 py-3 text-sm text-slate-400">
                {s.hostelName || (hostels as any[]).find((h: any) => h.id === s.hostelId)?.name || "—"}
              </td>
              <td className="px-4 py-3 text-sm text-slate-400 max-w-32 truncate" title={s.assignedMess}>{s.assignedMess || "—"}</td>
              <td className="px-4 py-3 text-sm text-slate-400">{s.phone || s.contactNumber || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setSelected(s)}
                    title="View Profile"
                    className="p-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    onClick={() => openAssign(s)}
                    title="Assign Hostel"
                    className="text-xs px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-all flex items-center gap-1"
                  >
                    <Building2 size={12} /> Assign
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {/* Profile Modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Student Profile" width="max-w-lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
                <span className="text-purple-400 text-xl font-bold">{(selected.name || "?")[0].toUpperCase()}</span>
              </div>
              <div>
                <p className="text-lg font-bold text-white">{selected.name}</p>
                <p className="text-sm text-slate-400">{selected.email}</p>
              </div>
            </div>

            {/* Mess Card Number — highlighted */}
            {selected.messCardNo && (
              <div className="bg-purple-500/10 border border-purple-500/40 rounded-2xl p-4 flex flex-col items-center gap-1">
                <div className="flex items-center gap-2 text-purple-400">
                  <CreditCard size={15} />
                  <span className="text-xs font-semibold tracking-widest uppercase">Mess Card Number</span>
                </div>
                <p className="text-3xl font-bold text-purple-300 tracking-widest">{selected.messCardNo}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {[
                ["Roll Number", selected.rollNumber],
                ["Room", selected.roomNumber],
                ["Hostel", (hostels as any[]).find((h: any) => h.id === selected.hostelId)?.name || selected.hostelId],
                ["Mess", selected.assignedMess],
                ["Phone", selected.phone || selected.contactNumber],
                ["Gender", selected.gender],
                ["Area", selected.area],
              ].map(([label, value]) => (
                <div key={label as string} className="bg-white/3 rounded-xl p-3 border border-white/6">
                  <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-slate-200">{value || "—"}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
              <Button onClick={() => { setSelected(null); openAssign(selected); }}>
                <Building2 size={14} /> Assign Hostel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Assign Hostel Modal */}
      <Modal open={!!assignTarget} onClose={() => { setAssignTarget(null); setAssignError(""); }} title="Assign Hostel">
        {assignTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-white/3 rounded-xl p-3 border border-white/6">
              <div className="w-10 h-10 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-400 text-sm font-bold">{(assignTarget.name || "?")[0].toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">{assignTarget.name}</p>
                <p className="text-xs text-slate-500">{assignTarget.rollNumber || assignTarget.email}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Hostel</label>
              <Select value={assignHostelId} onChange={setAssignHostelId}>
                <option value="">— Unassign —</option>
                {(hostels as any[]).map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Room Number</label>
              <Input value={assignRoom} onChange={setAssignRoom} placeholder="e.g. A-101" />
            </div>

            {assignError && <p className="text-red-400 text-xs">{assignError}</p>}

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => { setAssignTarget(null); setAssignError(""); }}>Cancel</Button>
              <Button
                loading={assignMut.isPending}
                onClick={() => assignMut.mutate({ id: assignTarget.id, hostelId: assignHostelId, roomNumber: assignRoom })}
              >
                <Building2 size={14} /> Save Assignment
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
