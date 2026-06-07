import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { PageHeader, Card, Table, Input, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import { Package, Download, RefreshCw, Search, Lock, Unlock } from "lucide-react";

function ItemDot({ given, submitted }: { given: boolean; submitted: boolean }) {
  if (submitted) return <span className="inline-flex items-center gap-1 text-xs text-green-400"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Submitted</span>;
  if (given) return <span className="inline-flex items-center gap-1 text-xs text-yellow-400"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />Given</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-slate-600"><span className="w-2 h-2 rounded-full bg-slate-600 inline-block" />None</span>;
}

export default function Inventory() {
  const qc = useQueryClient();
  const [hostelFilter, setHostelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: hostels = [] } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => apiFetch<any[]>("/hostels"),
  });

  const { data: students = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["inv-students", hostelFilter],
    queryFn: () => apiFetch<any[]>(`/attendance${hostelFilter ? `?hostelId=${hostelFilter}` : ""}`),
    refetchInterval: 10000,
  });

  const revokeMut = useMutation({
    mutationFn: (studentId: string) =>
      apiFetch(`/attendance/inventory/${studentId}/revoke`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inv-students"] }),
  });

  const locked = students.filter((s: any) => s.inventory?.inventoryLocked).length;
  const hasItems = students.filter((s: any) => {
    const inv = s.inventory || {};
    return inv.mattress || inv.bedsheet || inv.pillow;
  }).length;

  const filtered = students.filter((s: any) => {
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

  return (
    <div className="fade-in">
      <PageHeader
        title="Inventory"
        subtitle="Room inventory — mattress, bedsheet, pillow status"
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
          { label: "Total Students", value: students.length, icon: Package, color: "text-purple-400 bg-purple-500/15" },
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
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={setSearch} placeholder="Search by name, roll, room…" className="pl-9" />
          </div>
          <Select value={hostelFilter} onChange={setHostelFilter} className="min-w-40">
            <option value="">All Hostels</option>
            {(hostels as any[]).map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={setStatusFilter} className="min-w-36">
            <option value="">All Status</option>
            <option value="locked">Locked</option>
            <option value="has_items">Has Items</option>
            <option value="active">Active</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw size={13} /> Refresh
          </Button>
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
              const hostelName = (hostels as any[]).find((h: any) => h.id === s.hostelId)?.name || s.hostelName || "—";
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
                  <td className="px-4 py-3"><ItemDot given={inv.mattress} submitted={inv.mattressSubmitted} /></td>
                  <td className="px-4 py-3"><ItemDot given={inv.bedsheet} submitted={inv.bedsheetSubmitted} /></td>
                  <td className="px-4 py-3"><ItemDot given={inv.pillow} submitted={inv.pillowSubmitted} /></td>
                  <td className="px-4 py-3">
                    {inv.inventoryLocked
                      ? <Badge label="Locked" color="green" />
                      : (inv.mattress || inv.bedsheet || inv.pillow)
                        ? <Badge label="Active" color="yellow" />
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
