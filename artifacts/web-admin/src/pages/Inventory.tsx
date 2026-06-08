import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card, Table, Input, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import {
  Package, Download, RefreshCw, Search, Lock, Unlock,
  CheckSquare, Square, CheckCircle, Clock, AlertCircle, RotateCcw, LogIn,
} from "lucide-react";

const COORD_UP = ["coordinator", "admin", "superadmin"];

function hasAnyGiven(inv: any) { return !!(inv?.mattress || inv?.bedsheet || inv?.pillow); }
function hasPendingGiven(inv: any) {
  return !!(
    (inv?.mattress && !inv?.mattressSubmitted) ||
    (inv?.bedsheet && !inv?.bedsheetSubmitted) ||
    (inv?.pillow && !inv?.pillowSubmitted)
  );
}
function overallStatus(s: any): "submitted" | "pending" | "not_returned" | "empty" {
  const inv = s?.inventory || {};
  const isLocked = !!inv.inventoryLocked;
  const anyGiven = hasAnyGiven(inv);
  const pending = hasPendingGiven(inv);
  const isCheckedOut = !!s?.checkOutTime;
  if (!anyGiven) return "empty";
  if (isLocked || !pending) return "submitted";
  if (isCheckedOut && pending) return "not_returned";
  return "pending";
}

// ─── Per-item action cell ─────────────────────────────────────────────────────
function ItemActionCell({
  studentId,
  item,
  given,
  submitted,
  checkedIn,
  checkedOut,
  onAction,
  busy,
}: {
  studentId: string;
  item: "mattress" | "bedsheet" | "pillow";
  given: boolean;
  submitted: boolean;
  checkedIn: boolean;
  checkedOut: boolean;
  onAction: (type: string, item: string, val?: boolean) => void;
  busy: boolean;
}) {
  const canInteract = checkedIn && !checkedOut;

  if (!checkedIn && !given) {
    return (
      <div className="flex flex-col gap-1 items-start">
        <span className="text-xs text-slate-600 flex items-center gap-1"><Square size={11} /> Not Given</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      {/* Give toggle */}
      <button
        onClick={() => canInteract && onAction("give", item, !given)}
        disabled={!canInteract || busy}
        title={canInteract ? (given ? "Mark not given" : "Mark given") : "Check in student first"}
        className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border transition-all disabled:opacity-50 ${
          given
            ? "bg-purple-600/15 border-purple-500/25 text-purple-400 hover:bg-purple-600/25"
            : "bg-white/5 border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
        }`}
      >
        {given ? <CheckSquare size={11} /> : <Square size={11} />}
        {given ? "Given" : "Not Given"}
      </button>

      {/* Submit / Revoke */}
      {given && !submitted && (
        <button
          onClick={() => canInteract && onAction("submit", item, true)}
          disabled={!canInteract || busy}
          title={canInteract ? "Mark as returned/submitted" : "Check in student first"}
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-50"
        >
          <Lock size={11} /> Submit
        </button>
      )}
      {submitted && (
        <button
          onClick={() => onAction("revoke-submit", item, true)}
          disabled={busy}
          title="Undo submission"
          className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border bg-green-500/10 border-green-500/20 text-green-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all group disabled:opacity-50"
        >
          <CheckCircle size={11} className="group-hover:hidden" />
          <RotateCcw size={11} className="hidden group-hover:block" />
          <span className="group-hover:hidden">Done</span>
          <span className="hidden group-hover:block">Undo</span>
        </button>
      )}
      {!submitted && !given && checkedOut && (
        <span className="text-[11px] text-red-400 flex items-center gap-1"><AlertCircle size={10} /> Not returned</span>
      )}
    </div>
  );
}

// ─── Volunteer Inventory View ─────────────────────────────────────────────────
function VolunteerInventory() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const hostelId = user?.hostelId || "";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  const QK = ["inv-vol-full", hostelId];

  const { data: students = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => apiFetch<any[]>(`/inventory-simple${hostelId ? `?hostelId=${hostelId}` : ""}`),
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    enabled: !!hostelId,
  });

  const setBusy = (id: string, val: boolean) =>
    setBusyMap(m => ({ ...m, [id]: val }));

  async function handleAction(studentId: string, type: string, item: string, val?: boolean) {
    if (busyMap[studentId]) return;
    setBusy(studentId, true);
    try {
      if (type === "give") {
        await apiFetch(`/inventory-simple/${studentId}`, {
          method: "PATCH",
          body: JSON.stringify({ [item]: val }),
        });
      } else if (type === "submit") {
        await apiFetch(`/inventory-simple/${studentId}/submit`, {
          method: "POST",
          body: JSON.stringify({ [item]: val }),
        });
      } else if (type === "revoke-submit") {
        if (!confirm(`Undo ${item} submission?`)) return;
        await apiFetch(`/inventory-simple/${studentId}/revoke-submit`, {
          method: "POST",
          body: JSON.stringify({ [item]: true }),
        });
      }
      qc.invalidateQueries({ queryKey: QK });
    } catch (e: any) {
      alert(e.message || "Action failed");
    } finally {
      setBusy(studentId, false);
    }
  }

  const locked = (students as any[]).filter(s => s.inventory?.inventoryLocked).length;
  const pending = (students as any[]).filter(s => {
    const inv = s.inventory || {};
    return (s.checkInTime && !s.checkOutTime) && (inv.mattress || inv.bedsheet || inv.pillow) && !inv.inventoryLocked;
  }).length;

  const filtered = (students as any[]).filter(s => {
    const st = overallStatus(s);
    if (filter === "submitted" && st !== "submitted") return false;
    if (filter === "pending" && st !== "pending") return false;
    if (filter === "not_returned" && st !== "not_returned") return false;
    if (filter === "empty" && st !== "empty") return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) ||
      (s.rollNumber || "").toLowerCase().includes(q) ||
      (s.roomNumber || "").toLowerCase().includes(q);
  });

  if (!hostelId) {
    return <EmptyState icon={Package} title="No Hostel Assigned" sub="You need to be assigned to a hostel." />;
  }

  const ITEMS = ["mattress", "bedsheet", "pillow"] as const;

  return (
    <div className="fade-in">
      <PageHeader
        title="Inventory"
        subtitle={`Room inventory for ${hostelId} — give & submit per item`}
        action={<Button variant="ghost" size="sm" onClick={() => refetch()}>{isRefetching ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh</Button>}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Submitted", value: locked, icon: Lock, color: "text-green-400 bg-green-500/15" },
          { label: "Pending Return", value: pending, icon: Clock, color: "text-yellow-400 bg-yellow-500/15" },
          { label: "Total Students", value: (students as any[]).length, icon: Package, color: "text-purple-400 bg-purple-500/15" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon size={18} /></div>
            <div><p className="text-xl font-bold text-white">{value}</p><p className="text-xs text-slate-500">{label}</p></div>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 px-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Square size={12} className="text-slate-500" /> Not Given
        </div>
        <div className="flex items-center gap-1.5 text-xs text-purple-400">
          <CheckSquare size={12} /> Given (tap Submit when returned)
        </div>
        <div className="flex items-center gap-1.5 text-xs text-green-400">
          <CheckCircle size={12} /> Submitted (hover to undo)
        </div>
        <div className="flex items-center gap-1.5 text-xs text-blue-400">
          <Lock size={12} /> Ready to submit
        </div>
      </div>

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={setSearch} placeholder="Search by name, roll, room…" className="pl-9" />
          </div>
          <Select value={filter} onChange={setFilter} className="min-w-40">
            <option value="">All Status</option>
            <option value="submitted">Submitted</option>
            <option value="pending">Pending</option>
            <option value="not_returned">Not Returned</option>
            <option value="empty">Empty</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /> Refresh</Button>
          <span className="text-xs text-slate-500 ml-auto">{filtered.length} students</span>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title="No students" sub="No students match your filter" />
        ) : (
          <Table headers={["Student", "Room", "Check-in", "Mattress", "Bedsheet", "Pillow", "Status"]}>
            {filtered.map((s: any) => {
              const inv = s.inventory || {};
              const isLocked = !!inv.inventoryLocked;
              const isBusy = !!busyMap[s.id];
              const checkedIn = !!s.checkInTime;
              const checkedOut = !!s.checkOutTime;
              const st = overallStatus(s);
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
                  <td className="px-4 py-3 text-sm text-slate-400">{s.roomNumber || "—"}</td>
                  <td className="px-4 py-3">
                    {checkedIn ? (
                      <div>
                        <p className="text-xs text-green-400 flex items-center gap-1">
                          <LogIn size={10} />
                          {new Date(s.checkInTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {checkedOut && (
                          <p className="text-xs text-indigo-400">{new Date(s.checkOutTime).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" })}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">Not checked in</span>
                    )}
                  </td>
                  {ITEMS.map(item => (
                    <td key={item} className="px-4 py-3">
                      {isBusy ? (
                        <Spinner size={14} />
                      ) : (
                        <ItemActionCell
                          studentId={s.id}
                          item={item}
                          given={!!inv[item]}
                          submitted={!!inv[`${item}Submitted` as keyof typeof inv]}
                          checkedIn={checkedIn}
                          checkedOut={checkedOut}
                          onAction={(type, it, val) => handleAction(s.id, type, it, val)}
                          busy={isBusy}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    {st === "submitted" ? <Badge label="Submitted" color="green" /> :
                     st === "pending" ? <Badge label="Pending" color="yellow" /> :
                     st === "not_returned" ? <Badge label="Not Returned" color="red" /> :
                     <Badge label="Empty" color="gray" />}
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

// ─── Coordinator/Admin/SuperAdmin Inventory View ──────────────────────────────
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
