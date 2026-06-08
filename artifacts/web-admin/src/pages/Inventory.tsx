import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card, Table, Input, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import { Package, Download, RefreshCw, Search, Lock, Unlock, CheckSquare, Square } from "lucide-react";

const COORD_UP = ["coordinator", "admin", "superadmin"];

// ─── Volunteer Inventory View — optimistic checkboxes + submit ───────────────
function VolunteerInventory() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const hostelId = user?.hostelId || "";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [submitting, setSubmitting] = useState<Set<string>>(new Set());
  const QK = ["inv-vol", hostelId];

  const { data: students = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => apiFetch<any[]>(`/attendance${hostelId ? `?hostelId=${hostelId}` : ""}`),
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    enabled: !!hostelId,
  });

  // Optimistic checkbox mutation
  const patchMut = useMutation({
    mutationFn: ({ studentId, field, value }: { studentId: string; field: string; value: boolean }) =>
      apiFetch(`/attendance/inventory/${studentId}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      }),
    onMutate: async ({ studentId, field, value }) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<any[]>(QK);
      qc.setQueryData<any[]>(QK, old =>
        (old || []).map(s =>
          s.id === studentId
            ? { ...s, inventory: { ...(s.inventory || {}), [field]: value } }
            : s
        )
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });

  async function submitInventory(studentId: string, name: string) {
    if (!confirm(`Submit inventory for ${name}? This permanently locks it and cannot be undone.`)) return;
    setSubmitting(p => new Set([...p, studentId]));
    try {
      await apiFetch(`/attendance/inventory/${studentId}/submit`, { method: "POST" });
      qc.invalidateQueries({ queryKey: QK });
    } finally {
      setSubmitting(p => { const n = new Set(p); n.delete(studentId); return n; });
    }
  }

  const locked = (students as any[]).filter((s: any) => s.inventory?.inventoryLocked).length;
  const hasItems = (students as any[]).filter((s: any) => {
    const inv = s.inventory || {};
    return inv.mattress || inv.bedsheet || inv.pillow;
  }).length;

  const filtered = (students as any[]).filter((s: any) => {
    const inv = s.inventory || {};
    if (filter === "locked" && !inv.inventoryLocked) return false;
    if (filter === "active" && inv.inventoryLocked) return false;
    if (filter === "has_items" && !(inv.mattress || inv.bedsheet || inv.pillow)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) ||
      (s.rollNumber || "").toLowerCase().includes(q) ||
      (s.roomNumber || "").toLowerCase().includes(q);
  });

  if (!hostelId) {
    return <EmptyState icon={Package} title="No Hostel Assigned" sub="You need to be assigned to a hostel." />;
  }

  function Checkbox({ studentId, field, checked, locked }: { studentId: string; field: string; checked: boolean; locked: boolean }) {
    const isPending = patchMut.isPending &&
      (patchMut.variables as any)?.studentId === studentId &&
      (patchMut.variables as any)?.field === field;

    if (locked) {
      return checked
        ? <CheckSquare size={16} className="text-green-400" />
        : <Square size={16} className="text-slate-600" />;
    }
    return (
      <button
        onClick={() => patchMut.mutate({ studentId, field, value: !checked })}
        disabled={isPending}
        className="disabled:opacity-40 transition-all hover:scale-110"
      >
        {checked
          ? <CheckSquare size={16} className="text-purple-400" />
          : <Square size={16} className="text-slate-500 hover:text-slate-300" />}
      </button>
    );
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Inventory"
        subtitle={`Room inventory for ${hostelId} — mattress, bedsheet, pillow`}
        action={<Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /> Refresh</Button>}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Locked / Submitted", value: locked, icon: Lock, color: "text-green-400 bg-green-500/15" },
          { label: "Has Items", value: hasItems, icon: Package, color: "text-yellow-400 bg-yellow-500/15" },
          { label: "Total Students", value: (students as any[]).length, icon: Package, color: "text-purple-400 bg-purple-500/15" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon size={18} /></div>
            <div><p className="text-xl font-bold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={setSearch} placeholder="Search by name, roll, room…" className="pl-9" />
          </div>
          <Select value={filter} onChange={setFilter} className="min-w-36">
            <option value="">All Status</option>
            <option value="locked">Locked</option>
            <option value="has_items">Has Items</option>
            <option value="active">Not Locked</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /> Refresh</Button>
          <span className="text-xs text-slate-500 ml-auto">{filtered.length} students</span>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title="No students" sub="No students match your filter" />
        ) : (
          <Table headers={["Student", "Roll No", "Room", "Mattress", "Bedsheet", "Pillow", "Status", "Submit"]}>
            {filtered.map((s: any) => {
              const inv = s.inventory || {};
              const isLocked = !!inv.inventoryLocked;
              const isSubmitting = submitting.has(s.id);
              const hasAny = inv.mattress || inv.bedsheet || inv.pillow;
              return (
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-purple-400 text-xs font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.rollNumber || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{s.rollNumber || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{s.roomNumber || "—"}</td>
                  <td className="px-4 py-3"><Checkbox studentId={s.id} field="mattress" checked={!!inv.mattress} locked={isLocked} /></td>
                  <td className="px-4 py-3"><Checkbox studentId={s.id} field="bedsheet" checked={!!inv.bedsheet} locked={isLocked} /></td>
                  <td className="px-4 py-3"><Checkbox studentId={s.id} field="pillow" checked={!!inv.pillow} locked={isLocked} /></td>
                  <td className="px-4 py-3">
                    {isLocked
                      ? <Badge label="Locked" color="green" />
                      : hasAny ? <Badge label="Active" color="yellow" />
                      : <Badge label="Empty" color="gray" />}
                  </td>
                  <td className="px-4 py-3">
                    {!isLocked ? (
                      <button
                        onClick={() => submitInventory(s.id, s.name)}
                        disabled={isSubmitting || !hasAny}
                        className="text-xs px-2.5 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-all disabled:opacity-40 flex items-center gap-1"
                      >
                        {isSubmitting ? <Spinner size={11} /> : <Lock size={11} />} Submit
                      </button>
                    ) : (
                      <span className="text-xs text-green-500/60 flex items-center gap-1"><Lock size={11} /> Locked</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ─── Coordinator/Admin/SuperAdmin Inventory View ─────────────────────────────
function CoordInventory() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isRestricted = !COORD_UP.includes(user?.role || "");
  const [hostelFilter, setHostelFilter] = useState(isRestricted ? (user?.hostelId || "") : "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: hostels = [] } = useQuery({ queryKey: ["hostels"], queryFn: () => apiFetch<any[]>("/hostels") });
  const { data: students = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["inv-students", hostelFilter],
    queryFn: () => apiFetch<any[]>(`/attendance${hostelFilter ? `?hostelId=${hostelFilter}` : ""}`),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const revokeMut = useMutation({
    mutationFn: (studentId: string) =>
      apiFetch(`/attendance/inventory/${studentId}/revoke`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inv-students"] }),
  });

  const locked = (students as any[]).filter((s: any) => s.inventory?.inventoryLocked).length;
  const hasItems = (students as any[]).filter((s: any) => {
    const inv = s.inventory || {};
    return inv.mattress || inv.bedsheet || inv.pillow;
  }).length;

  const filtered = (students as any[]).filter((s: any) => {
    const inv = s.inventory || {};
    if (statusFilter === "locked" && !inv.inventoryLocked) return false;
    if (statusFilter === "active" && inv.inventoryLocked) return false;
    if (statusFilter === "has_items" && !(inv.mattress || inv.bedsheet || inv.pillow)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) ||
      (s.rollNumber || "").toLowerCase().includes(q) ||
      (s.roomNumber || "").toLowerCase().includes(q);
  });

  function dot(given: boolean) {
    return given
      ? <CheckSquare size={14} className="text-green-400" />
      : <Square size={14} className="text-slate-600" />;
  }

  return (
    <div className="fade-in">
      <PageHeader title="Inventory" subtitle="Room inventory — mattress, bedsheet, pillow status"
        action={
          <Button variant="secondary" size="sm" onClick={() => downloadFile("/export/inventory.csv", "inventory.csv")}>
            <Download size={14} /> Download CSV
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Locked / Submitted", value: locked, icon: Lock, color: "text-green-400 bg-green-500/15" },
          { label: "Has Items", value: hasItems, icon: Package, color: "text-yellow-400 bg-yellow-500/15" },
          { label: "Total Students", value: (students as any[]).length, icon: Package, color: "text-purple-400 bg-purple-500/15" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon size={18} /></div>
            <div><p className="text-xl font-bold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={setSearch} placeholder="Search by name, roll, room…" className="pl-9" />
          </div>
          <Select value={hostelFilter} onChange={setHostelFilter} className="min-w-40" disabled={isRestricted}>
            <option value="">All Hostels</option>
            {(hostels as any[]).map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={setStatusFilter} className="min-w-36">
            <option value="">All Status</option>
            <option value="locked">Locked</option>
            <option value="has_items">Has Items</option>
            <option value="active">Active</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /> Refresh</Button>
          <span className="text-xs text-slate-500 ml-auto">{filtered.length} students</span>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title="No inventory records" sub="Select a hostel to view inventory" />
        ) : (
          <Table headers={["Student", "Roll No", "Room", "Hostel", "Mattress", "Bedsheet", "Pillow", "Status", "Action"]}>
            {filtered.map((s: any) => {
              const inv = s.inventory || {};
              const hostelName = (hostels as any[]).find((h: any) => h.id === s.hostelId)?.name || "—";
              return (
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
                  <td className="px-4 py-3 text-sm text-slate-400">{s.roomNumber || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{hostelName}</td>
                  <td className="px-4 py-3">{dot(inv.mattress)}</td>
                  <td className="px-4 py-3">{dot(inv.bedsheet)}</td>
                  <td className="px-4 py-3">{dot(inv.pillow)}</td>
                  <td className="px-4 py-3">
                    {inv.inventoryLocked ? <Badge label="Locked" color="green" />
                      : (inv.mattress || inv.bedsheet || inv.pillow) ? <Badge label="Active" color="yellow" />
                      : <Badge label="Empty" color="gray" />}
                  </td>
                  <td className="px-4 py-3">
                    {(inv.mattress || inv.bedsheet || inv.pillow || inv.inventoryLocked) && (
                      <button
                        onClick={() => { if (confirm(`Revoke all inventory for ${s.name}?`)) revokeMut.mutate(s.id); }}
                        disabled={revokeMut.isPending}
                        className="text-xs px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                      >
                        <Unlock size={11} /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  if (user?.role === "volunteer") return <VolunteerInventory />;
  return <CoordInventory />;
}
