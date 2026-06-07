import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PageHeader, Card, Table, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import { History as HistoryIcon, RefreshCw, Users, Package } from "lucide-react";
import { format } from "date-fns";

function fmt(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" });
}

export default function History() {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [tab, setTab] = useState<"checkins" | "inventory">("checkins");
  const [date, setDate] = useState(today);
  const [hostelFilter, setHostelFilter] = useState("");

  const { data: hostels = [] } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => apiFetch<any[]>("/hostels"),
  });

  const { data: checkins = [], isLoading: checkinsLoading, refetch: refetchCheckins } = useQuery<any[]>({
    queryKey: ["history-checkins", date, hostelFilter],
    queryFn: () => apiFetch<any[]>(`/checkins?date=${date}${hostelFilter ? `&hostelId=${hostelFilter}` : ""}&limit=500`),
    enabled: tab === "checkins",
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const { data: inventory = [], isLoading: inventoryLoading, refetch: refetchInventory } = useQuery<any[]>({
    queryKey: ["history-inventory", hostelFilter],
    queryFn: () => apiFetch<any[]>(`/inventory-simple${hostelFilter ? `?hostelId=${hostelFilter}` : ""}`),
    enabled: tab === "inventory",
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const isLoading = tab === "checkins" ? checkinsLoading : inventoryLoading;
  const refetch = tab === "checkins" ? refetchCheckins : refetchInventory;

  const inCampus = checkins.filter((c: any) => !c.checkOutTime).length;
  const checkedOut = checkins.filter((c: any) => !!c.checkOutTime).length;
  const invStudents = inventory.filter((s: any) => s.inventory?.inventoryLocked || s.inventory?.mattress || s.inventory?.bedsheet || s.inventory?.pillow);

  return (
    <div className="fade-in">
      <PageHeader
        title="History"
        subtitle="Overall attendance & inventory history for all students"
        action={
          <Button variant="ghost" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["history-checkins"] }); qc.invalidateQueries({ queryKey: ["history-inventory"] }); refetch(); }}>
            <RefreshCw size={13} /> Refresh
          </Button>
        }
      />

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("checkins")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${tab === "checkins" ? "bg-purple-600/20 text-purple-400 border-purple-500/30" : "text-slate-400 border-white/8 hover:bg-white/5"}`}
        >
          <Users size={14} /> Attendance History
        </button>
        <button
          onClick={() => setTab("inventory")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${tab === "inventory" ? "bg-purple-600/20 text-purple-400 border-purple-500/30" : "text-slate-400 border-white/8 hover:bg-white/5"}`}
        >
          <Package size={14} /> Inventory Status
        </button>
      </div>

      {tab === "checkins" && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "In Campus", value: inCampus, color: "text-green-400 bg-green-500/15" },
              { label: "Checked Out", value: checkedOut, color: "text-blue-400 bg-blue-500/15" },
              { label: "Total Records", value: checkins.length, color: "text-purple-400 bg-purple-500/15" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="p-4">
                <p className={`text-xl font-bold ${color.split(" ")[0]}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </Card>
            ))}
          </div>

          <Card>
            <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={today}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-500/60 transition-all"
              />
              <Select value={hostelFilter} onChange={setHostelFilter} className="min-w-40">
                <option value="">All Hostels</option>
                {(hostels as any[]).map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
              <span className="text-xs text-slate-500 ml-auto">{checkins.length} records</span>
            </div>
            {checkinsLoading ? (
              <div className="py-12 flex justify-center"><Spinner size={24} /></div>
            ) : checkins.length === 0 ? (
              <EmptyState icon={HistoryIcon} title="No records found" sub="No attendance records for this date" />
            ) : (
              <Table headers={["Student", "Roll", "Room", "Hostel", "Marked By", "Check In", "Check Out", "Status"]}>
                {(checkins as any[]).map((c: any) => {
                  const checkedOutNow = !!c.checkOutTime;
                  const hostelName = (hostels as any[]).find((h: any) => h.id === c.hostelId)?.name || "—";
                  return (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-200">{c.studentName || "—"}</p>
                        <p className="text-xs text-slate-500">{c.studentEmail || c.studentId}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{c.studentRoll || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{c.studentRoom || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{hostelName}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{c.volunteerName || "—"}</td>
                      <td className="px-4 py-3 text-sm font-medium text-green-400">{fmtTime(c.checkInTime)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-blue-400">{fmtTime(c.checkOutTime)}</td>
                      <td className="px-4 py-3">
                        <Badge label={checkedOutNow ? "Checked Out" : "In Campus"} color={checkedOutNow ? "blue" : "green"} />
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === "inventory" && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "With Inventory", value: invStudents.length, color: "text-purple-400 bg-purple-500/15" },
              { label: "Inventory Locked", value: inventory.filter((s: any) => s.inventory?.inventoryLocked).length, color: "text-green-400 bg-green-500/15" },
              { label: "Total Students", value: inventory.length, color: "text-slate-400 bg-slate-500/15" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="p-4">
                <p className={`text-xl font-bold ${color.split(" ")[0]}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </Card>
            ))}
          </div>

          <Card>
            <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
              <Select value={hostelFilter} onChange={setHostelFilter} className="min-w-40">
                <option value="">All Hostels</option>
                {(hostels as any[]).map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
              <span className="text-xs text-slate-500 ml-auto">{inventory.length} students</span>
            </div>
            {inventoryLoading ? (
              <div className="py-12 flex justify-center"><Spinner size={24} /></div>
            ) : inventory.length === 0 ? (
              <EmptyState icon={Package} title="No inventory records" sub="Select a hostel to view inventory" />
            ) : (
              <Table headers={["Student", "Roll", "Room", "Hostel", "Mattress", "Bedsheet", "Pillow", "Mess Card", "Given By", "Status"]}>
                {(inventory as any[]).map((s: any) => {
                  const inv = s.inventory || {};
                  const hostelName = (hostels as any[]).find((h: any) => h.id === s.hostelId)?.name || "—";
                  const InventoryDot = ({ given, submitted }: { given: boolean; submitted: boolean }) => (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${submitted ? "text-green-400 bg-green-500/10 border-green-500/20" : given ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" : "text-slate-500 bg-slate-500/10 border-slate-500/20"}`}>
                      {submitted ? "✓ Submitted" : given ? "Given" : "—"}
                    </span>
                  );
                  return (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-200">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{s.rollNumber || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{s.roomNumber || "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{hostelName}</td>
                      <td className="px-4 py-3"><InventoryDot given={inv.mattress} submitted={inv.mattressSubmitted} /></td>
                      <td className="px-4 py-3"><InventoryDot given={inv.bedsheet} submitted={inv.bedsheetSubmitted} /></td>
                      <td className="px-4 py-3"><InventoryDot given={inv.pillow} submitted={inv.pillowSubmitted} /></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${inv.messCard ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-slate-500 bg-slate-500/10 border-slate-500/20"}`}>
                          {inv.messCard ? `✓ Given${inv.messCardGivenAt ? ` ${fmtTime(inv.messCardGivenAt)}` : ""}` : "Not Given"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{inv.messCardGivenByName || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge label={inv.inventoryLocked ? "Locked" : inv.mattress || inv.bedsheet || inv.pillow ? "Partial" : "Empty"} color={inv.inventoryLocked ? "green" : inv.mattress || inv.bedsheet || inv.pillow ? "yellow" : "gray"} />
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
