import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { PageHeader, Card, Table, Input, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import { UtensilsCrossed, Download, RefreshCw, Search, CheckCircle, XCircle, Clock } from "lucide-react";

function fmtTime(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" });
}

export default function Mess() {
  const qc = useQueryClient();
  const [hostelFilter, setHostelFilter] = useState("");
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  const { data: hostels = [] } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => apiFetch<any[]>("/hostels"),
  });

  const { data: students = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["mess-students", hostelFilter],
    queryFn: () => apiFetch<any[]>(`/attendance${hostelFilter ? `?hostelId=${hostelFilter}` : ""}`),
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const toggleMut = useMutation({
    mutationFn: ({ studentId, messCard }: { studentId: string; messCard: boolean }) =>
      apiFetch(`/attendance/mess-card/${studentId}`, { method: "PATCH", body: JSON.stringify({ messCard }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mess-students"] }); },
    onSettled: () => setToggling(null),
  });

  const given = students.filter((s: any) => s.inventory?.messCard).length;
  const notGiven = students.length - given;

  const filtered = students.filter((s: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) ||
      (s.rollNumber || "").toLowerCase().includes(q) ||
      (s.roomNumber || "").toLowerCase().includes(q);
  });

  return (
    <div className="fade-in">
      <PageHeader
        title="Mess Cards"
        subtitle="Assign or revoke mess cards for students"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => downloadFile("/export/inventory.csv", "mess-inventory.csv")}>
              <Download size={14} /> Export CSV
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Card Given", value: given, icon: CheckCircle, color: "text-green-400 bg-green-500/15" },
          { label: "Card Not Given", value: notGiven, icon: XCircle, color: "text-red-400 bg-red-500/15" },
          { label: "Total Students", value: students.length, icon: Clock, color: "text-purple-400 bg-purple-500/15" },
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
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <span className="text-xs text-slate-500 ml-auto">{filtered.length} students</span>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="No students found" sub="Select a hostel or search to filter students" />
        ) : (
          <Table headers={["Student", "Roll No", "Room", "Mess", "Mess Card", "Given At / Revoked At", "Given By", "Action"]}>
            {filtered.map((s: any) => {
              const inv = s.inventory || {};
              const hasCard = !!inv.messCard;
              const timeDisplay = hasCard
                ? (inv.messCardGivenAt ? `Given ${fmtTime(inv.messCardGivenAt)}` : "Given")
                : (inv.messCardRevokedAt ? `Revoked ${fmtTime(inv.messCardRevokedAt)}` : "—");
              const messName = s.assignedMess || "—";
              const isToggling = toggling === s.id;
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
                  <td className="px-4 py-3 text-sm text-slate-400">{messName}</td>
                  <td className="px-4 py-3">
                    <Badge label={hasCard ? "Given" : "Not Given"} color={hasCard ? "green" : "gray"} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{timeDisplay}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{inv.messCardGivenByName || "—"}</td>
                  <td className="px-4 py-3">
                    {hasCard ? (
                      <button
                        onClick={() => { setToggling(s.id); toggleMut.mutate({ studentId: s.id, messCard: false }); }}
                        disabled={isToggling || toggleMut.isPending}
                        className="text-xs px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                      >
                        {isToggling ? <Spinner size={11} /> : null}
                        Revoke Card
                      </button>
                    ) : (
                      <button
                        onClick={() => { setToggling(s.id); toggleMut.mutate({ studentId: s.id, messCard: true }); }}
                        disabled={isToggling || toggleMut.isPending}
                        className="text-xs px-2.5 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                      >
                        {isToggling ? <Spinner size={11} /> : null}
                        Give Card
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
