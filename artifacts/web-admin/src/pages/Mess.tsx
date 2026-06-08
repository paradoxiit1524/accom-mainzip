import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card, Table, Input, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import { UtensilsCrossed, Download, RefreshCw, Search, CheckCircle, XCircle, CreditCard, Pencil, Check, X } from "lucide-react";

const COORD_UP = ["coordinator", "admin", "superadmin"];

function fmtTime(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" });
}

function CardNoCell({ student, onSaved }: { student: any; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(student.messCardNo || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setVal(student.messCardNo || "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/students/${student.id}`, {
        method: "PATCH",
        body: JSON.stringify({ messCardNo: val.trim() || null }),
      });
      onSaved();
      setEditing(false);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setVal(student.messCardNo || "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
          className="w-24 text-xs bg-white/8 border border-purple-500/50 rounded-md px-2 py-1 text-purple-200 outline-none focus:border-purple-400"
          placeholder="e.g. 1234"
          disabled={saving}
        />
        <button
          onClick={save}
          disabled={saving}
          className="w-6 h-6 flex items-center justify-center rounded bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 transition-all"
        >
          {saving ? <Spinner size={10} /> : <Check size={11} />}
        </button>
        <button
          onClick={cancel}
          className="w-6 h-6 flex items-center justify-center rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
        >
          <X size={11} />
        </button>
      </div>
    );
  }

  if (student.messCardNo) {
    return (
      <div className="flex items-center gap-1.5 group">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-bold tracking-wide">
          <CreditCard size={11} /> #{student.messCardNo}
        </span>
        <button
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-purple-300 transition-all"
        >
          <Pencil size={10} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-slate-600 text-slate-500 text-xs hover:border-purple-500/50 hover:text-purple-400 transition-all"
    >
      <Pencil size={9} /> Set no.
    </button>
  );
}

export default function Mess() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isRestricted = !COORD_UP.includes(user?.role || "");
  const [hostelFilter, setHostelFilter] = useState(isRestricted ? (user?.hostelId || "") : "");
  const [search, setSearch] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);

  const { data: hostels = [] } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => apiFetch<any[]>("/hostels"),
  });

  const { data: raw, isLoading, refetch } = useQuery<any>({
    queryKey: ["mess-students", hostelFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "10000", offset: "0" });
      if (hostelFilter) params.set("hostelId", hostelFilter);
      return apiFetch<any>(`/students?${params}`);
    },
    refetchInterval: 30000,
    staleTime: 20000,
    refetchOnWindowFocus: true,
  });

  const students: any[] = Array.isArray(raw) ? raw : (raw?.students || raw?.data || []);

  const toggleMut = useMutation({
    mutationFn: ({ studentId, messCard }: { studentId: string; messCard: boolean }) =>
      apiFetch(`/attendance/mess-card/${studentId}`, { method: "PATCH", body: JSON.stringify({ messCard }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mess-students"] }); },
    onSettled: () => setToggling(null),
  });

  const given = students.filter((s: any) => s.messCard).length;
  const notGiven = students.length - given;
  const withSerialNo = students.filter((s: any) => s.messCardNo).length;

  const filtered = students.filter((s: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) ||
      (s.rollNumber || "").toLowerCase().includes(q) ||
      (s.roomNumber || "").toLowerCase().includes(q) ||
      (s.messCardNo || "").toLowerCase().includes(q);
  });

  return (
    <div className="fade-in">
      <PageHeader
        title="Mess Cards"
        subtitle="Assign or revoke mess cards — serial numbers from master CSV"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => downloadFile("/export/inventory.csv", "mess-inventory.csv")}>
              <Download size={14} /> Export CSV
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Card Given", value: given, icon: CheckCircle, color: "text-green-400 bg-green-500/15" },
          { label: "Card Not Given", value: notGiven, icon: XCircle, color: "text-red-400 bg-red-500/15" },
          { label: "Serial No. Assigned", value: withSerialNo, icon: CreditCard, color: "text-purple-400 bg-purple-500/15" },
          { label: "Total Students", value: students.length, icon: UtensilsCrossed, color: "text-blue-400 bg-blue-500/15" },
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
            <Input value={search} onChange={setSearch} placeholder="Search by name, roll, room, card no…" className="pl-9" />
          </div>
          <Select value={hostelFilter} onChange={setHostelFilter} className="min-w-40" disabled={isRestricted}>
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
          <Table headers={["Student", "Roll No", "Card Serial No.", "Room", "Mess", "Status", "Given At / Revoked At", "Given By", "Action"]}>
            {filtered.map((s: any) => {
              const hasCard = !!s.messCard;
              const timeDisplay = hasCard
                ? (s.messCardGivenAt ? `Given ${fmtTime(s.messCardGivenAt)}` : "Given")
                : (s.messCardRevokedAt ? `Revoked ${fmtTime(s.messCardRevokedAt)}` : "—");
              const messName = s.assignedMess || s.allottedMess || "—";
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
                  <td className="px-4 py-3">
                    <CardNoCell student={s} onSaved={() => qc.invalidateQueries({ queryKey: ["mess-students"] })} />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{s.roomNumber || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-400 max-w-32 truncate" title={messName}>{messName}</td>
                  <td className="px-4 py-3">
                    <Badge label={hasCard ? "Given" : "Not Given"} color={hasCard ? "green" : "gray"} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{timeDisplay}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{s.messCardGivenByName || "—"}</td>
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
