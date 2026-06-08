import React, { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, Card, Table, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import {
  ClipboardCheck, Download, RefreshCw, CheckCircle, XCircle, UserPlus,
  Search, X, Calendar, CalendarDays, LogIn, LogOut, Package,
  RotateCcw, AlertCircle, Clock, CheckSquare, Square, Info, Lock,
} from "lucide-react";
import { format } from "date-fns";

const COORD_UP = ["coordinator", "admin", "superadmin"];

function fmt(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" });
}

// ─── Student Detail Slide-over (Volunteer full flow) ─────────────────────────
function StudentDetailPanel({
  student,
  onClose,
  onDataChanged,
}: {
  student: any | null;
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const [checkinState, setCheckinState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async (silent = false) => {
    if (!student) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<any>(`/checkins/${student.id}/today`);
      setCheckinState(data);
    } catch (e: any) {
      setCheckinState(null);
      if (!silent) setError(e.message || "Failed to load student status");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    if (student) loadState();
  }, [student]);

  useEffect(() => {
    if (!student) return;
    const t = setInterval(() => loadState(true), 5000);
    return () => clearInterval(t);
  }, [student, loadState]);

  if (!student) return null;

  const checkin = checkinState?.checkin ?? null;
  const inv = checkinState?.inventory ?? {
    mattress: false, bedsheet: false, pillow: false,
    mattressSubmitted: false, bedsheetSubmitted: false, pillowSubmitted: false,
    inventoryLocked: false,
  };

  const isCheckedIn = !!checkin && !checkin.checkOutTime;
  const isCheckedOut = !!checkin?.checkOutTime;
  const hasSession = isCheckedIn || isCheckedOut;

  async function doAction(actionKey: string, fn: () => Promise<any>) {
    setActionLoading(actionKey);
    setError(null);
    try {
      await fn();
      await loadState(true);
      onDataChanged();
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  const checkIn = () => doAction("checkin", () =>
    apiFetch(`/checkins/${student.id}`, { method: "POST", body: JSON.stringify({}) })
  );

  const checkOut = () => {
    if (!checkin) return;
    doAction("checkout", () =>
      apiFetch(`/checkins/${checkin.id}/checkout`, { method: "PATCH", body: JSON.stringify({}) })
    );
  };

  const revokeCheckin = () => {
    if (!confirm(`Revoke attendance for ${student.name}? This clears check-in/out and resets inventory.`)) return;
    doAction("revoke-checkin", () =>
      apiFetch(`/checkins/${student.id}/today`, { method: "DELETE" })
    );
  };

  const revokeCheckout = () => doAction("revoke-checkout", () =>
    apiFetch(`/checkins/${checkin.id}/revoke-checkout`, { method: "PATCH", body: JSON.stringify({}) })
  );

  const giveItem = (item: string, val: boolean) => doAction(`give-${item}`, () =>
    apiFetch(`/inventory-simple/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [item]: val }),
    })
  );

  const submitItem = (item: string) => doAction(`submit-${item}`, () =>
    apiFetch(`/inventory-simple/${student.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ [item]: true }),
    })
  );

  const revokeSubmit = (item: string) => {
    if (!confirm(`Undo ${item} submission for ${student.name}?`)) return;
    doAction(`revoke-submit-${item}`, () =>
      apiFetch(`/inventory-simple/${student.id}/revoke-submit`, {
        method: "POST",
        body: JSON.stringify({ [item]: true }),
      })
    );
  };

  const canGiveInv = isCheckedIn && !isCheckedOut;
  const items = ["mattress", "bedsheet", "pillow"] as const;

  function itemStatusColor(item: typeof items[number]) {
    const given = inv[item];
    const submitted = inv[`${item}Submitted` as keyof typeof inv];
    if (!given) return "text-slate-500";
    if (submitted) return "text-green-400";
    if (isCheckedOut) return "text-red-400";
    return "text-yellow-400";
  }

  function itemStatusLabel(item: typeof items[number]) {
    const given = inv[item];
    const submitted = inv[`${item}Submitted` as keyof typeof inv];
    if (!given) return "Not Given";
    if (submitted) return "Submitted";
    if (isCheckedOut) return "Missing";
    return "Pending";
  }

  const Btn = ({ actionKey, children, className, onClick, disabled }: any) => (
    <button
      onClick={onClick}
      disabled={disabled || actionLoading === actionKey}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all disabled:opacity-50 ${className}`}
    >
      {actionLoading === actionKey ? <Spinner size={11} /> : children}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[#0d0d12] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0d0d12] border-b border-white/8 p-4 flex items-center gap-3 z-10">
          <div className="w-10 h-10 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-purple-400 text-sm font-bold">{(student.name || "?")[0].toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{student.name}</p>
            <p className="text-xs text-slate-500 truncate">
              {student.rollNumber || student.email}
              {student.roomNumber ? ` · Room ${student.roomNumber}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="py-10 flex flex-col items-center gap-2">
              <Spinner size={24} />
              <p className="text-sm text-slate-500">Loading status…</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle size={13} />{error}
                </div>
              )}

              {/* Status card */}
              <div className={`p-3 rounded-xl border flex items-center gap-3 ${
                isCheckedOut ? "bg-indigo-500/10 border-indigo-500/20" :
                isCheckedIn ? "bg-green-500/10 border-green-500/20" :
                "bg-slate-500/10 border-slate-500/20"
              }`}>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isCheckedOut ? "bg-indigo-400" : isCheckedIn ? "bg-green-400" : "bg-slate-500"
                }`} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">
                    {isCheckedOut ? "Checked Out" : isCheckedIn ? "Checked In" : "Not Checked In"}
                  </p>
                  {checkin?.checkInTime && (
                    <p className="text-xs text-slate-400">In: {fmt(checkin.checkInTime)}{checkin.checkOutTime ? ` · Out: ${fmt(checkin.checkOutTime)}` : ""}</p>
                  )}
                  {checkin?.volunteerName && (
                    <p className="text-xs text-purple-400/80">by {checkin.volunteerName}</p>
                  )}
                </div>
              </div>

              {/* Step 1 — Check In */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 tracking-widest mb-2">STEP 1 — CHECK IN</p>
                <div className="flex gap-2">
                  {!checkin ? (
                    <Btn actionKey="checkin" onClick={checkIn}
                      className="flex-1 justify-center bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/20">
                      <LogIn size={13} /> Check In
                    </Btn>
                  ) : (
                    <>
                      <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400 text-xs font-semibold">
                        <CheckCircle size={13} /> Checked In · {fmt(checkin.checkInTime)}
                      </div>
                      <Btn actionKey="revoke-checkin" onClick={revokeCheckin}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20">
                        <RotateCcw size={11} /> Revoke
                      </Btn>
                    </>
                  )}
                </div>
              </div>

              {/* Steps 2-4 — Give Inventory */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 tracking-widest mb-1">STEPS 2-4 — GIVE INVENTORY</p>
                <p className="text-xs text-slate-600 mb-2">
                  {!hasSession ? "Check in first to give items" : isCheckedOut ? "Student has checked out" : "Toggle to give each item"}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {items.map(item => {
                    const given = !!inv[item];
                    return (
                      <button
                        key={item}
                        onClick={() => canGiveInv && giveItem(item, !given)}
                        disabled={!canGiveInv || !!actionLoading}
                        className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all disabled:opacity-50 ${
                          canGiveInv && given
                            ? "bg-purple-600/20 border-purple-500/30 text-purple-300"
                            : canGiveInv
                            ? "bg-white/3 border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"
                            : "bg-white/3 border-white/8 text-slate-600"
                        }`}
                      >
                        {actionLoading === `give-${item}` ? <Spinner size={14} /> :
                          given ? <CheckSquare size={16} /> : <Square size={16} />}
                        <span className="text-xs font-medium capitalize">{item}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Per-item status chips */}
              <div className="grid grid-cols-3 gap-2">
                {items.map(item => (
                  <div key={item} className="text-center">
                    <p className={`text-[10px] font-semibold ${itemStatusColor(item)}`}>{itemStatusLabel(item)}</p>
                  </div>
                ))}
              </div>

              {/* Steps 5-7 — Submit Inventory */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 tracking-widest mb-1">STEPS 5-7 — SUBMIT INVENTORY</p>
                <p className="text-xs text-slate-600 mb-2">
                  {!hasSession ? "Check in first" : isCheckedOut ? "Student has checked out" : "Mark items returned by student"}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {items.map(item => {
                    const given = !!inv[item];
                    const submitted = !!inv[`${item}Submitted` as keyof typeof inv];
                    const canSubmit = canGiveInv && given && !submitted;
                    return (
                      <div key={item} className="flex flex-col gap-1">
                        {submitted ? (
                          <button
                            onClick={() => revokeSubmit(item)}
                            disabled={!!actionLoading}
                            className="p-2 rounded-xl border border-green-500/30 bg-green-500/10 flex flex-col items-center gap-1 text-green-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all group disabled:opacity-50"
                            title="Click to undo submission"
                          >
                            {actionLoading === `revoke-submit-${item}` ? <Spinner size={14} /> : (
                              <>
                                <CheckCircle size={16} className="group-hover:hidden" />
                                <RotateCcw size={16} className="hidden group-hover:block" />
                              </>
                            )}
                            <span className="text-[10px] font-medium capitalize">{item}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => canSubmit && submitItem(item)}
                            disabled={!canSubmit || !!actionLoading}
                            className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all disabled:opacity-40 ${
                              canSubmit
                                ? "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20"
                                : "bg-white/3 border-white/8 text-slate-600"
                            }`}
                          >
                            {actionLoading === `submit-${item}` ? <Spinner size={14} /> : <Lock size={16} />}
                            <span className="text-[10px] font-medium capitalize">{item}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {inv.inventoryLocked && (
                  <div className="flex items-center gap-2 p-2.5 mt-2 rounded-xl bg-green-500/8 border border-green-500/20 text-green-400 text-xs">
                    <CheckCircle size={12} /> All items returned — ready for checkout.
                  </div>
                )}
                {canGiveInv && !inv.mattress && !inv.bedsheet && !inv.pillow && (
                  <div className="flex items-center gap-2 p-2.5 mt-2 rounded-xl bg-yellow-500/8 border border-yellow-500/20 text-yellow-400 text-xs">
                    <Info size={12} /> No items given yet. Give items above first.
                  </div>
                )}
                {canGiveInv && (inv.mattress || inv.bedsheet || inv.pillow) && !inv.inventoryLocked && (
                  <div className="flex items-center gap-2 p-2.5 mt-2 rounded-xl bg-blue-500/8 border border-blue-500/20 text-blue-400 text-xs">
                    <Info size={12} /> Submit all given items, then check out.
                  </div>
                )}
              </div>

              {/* Check Out */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 tracking-widest mb-2">STEP 8 — CHECK OUT</p>
                <div className="flex gap-2">
                  {!isCheckedOut ? (
                    <Btn actionKey="checkout" onClick={checkOut}
                      disabled={!isCheckedIn}
                      className="flex-1 justify-center bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/20">
                      <LogOut size={13} /> Check Out
                    </Btn>
                  ) : (
                    <>
                      <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-xs font-semibold">
                        <CheckCircle size={13} /> Checked Out · {fmt(checkin?.checkOutTime)}
                      </div>
                      <Btn actionKey="revoke-checkout" onClick={revokeCheckout}
                        className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border-yellow-500/20">
                        <RotateCcw size={11} /> Undo
                      </Btn>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Volunteer Attendance + Inventory View ────────────────────────────────────
function VolunteerAttendance() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const hostelId = user?.hostelId || "";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "not_checked" | "checked_in" | "checked_out">("all");
  const [selected, setSelected] = useState<any | null>(null);
  const QK = ["inv-vol-attendance", hostelId];

  const { data: students = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => apiFetch<any[]>(`/inventory-simple${hostelId ? `?hostelId=${hostelId}` : ""}`),
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    enabled: !!hostelId,
  });

  const checkedIn = (students as any[]).filter(s => s.checkInTime && !s.checkOutTime).length;
  const checkedOut = (students as any[]).filter(s => !!s.checkOutTime).length;
  const notChecked = (students as any[]).filter(s => !s.checkInTime).length;

  const filtered = (students as any[]).filter(s => {
    if (filter === "not_checked" && s.checkInTime) return false;
    if (filter === "checked_in" && (!s.checkInTime || s.checkOutTime)) return false;
    if (filter === "checked_out" && !s.checkOutTime) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) ||
      (s.rollNumber || "").toLowerCase().includes(q) ||
      (s.roomNumber || "").toLowerCase().includes(q);
  });

  if (!hostelId) {
    return <EmptyState icon={ClipboardCheck} title="No Hostel Assigned" sub="You need to be assigned to a hostel to mark attendance." />;
  }

  function statusBadge(s: any) {
    if (s.checkOutTime) return <Badge label="Checked Out" color="blue" />;
    if (s.checkInTime) return <Badge label="Checked In" color="green" />;
    return <Badge label="Pending" color="gray" />;
  }

  function invSummary(s: any) {
    const inv = s.inventory || {};
    if (inv.inventoryLocked) return <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={11} /> Done</span>;
    const anyGiven = inv.mattress || inv.bedsheet || inv.pillow;
    if (anyGiven) return <span className="text-xs text-yellow-400 flex items-center gap-1"><Clock size={11} /> Pending</span>;
    return <span className="text-xs text-slate-600">—</span>;
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Room Attendance"
        subtitle={`${hostelId} hostel — check in, give & submit inventory`}
        action={
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            {isRefetching ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Checked In", value: checkedIn, icon: CheckCircle, color: "text-green-400 bg-green-500/15" },
          { label: "Checked Out", value: checkedOut, icon: LogOut, color: "text-indigo-400 bg-indigo-500/15" },
          { label: "Pending", value: notChecked, icon: Clock, color: "text-slate-400 bg-slate-500/15" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold text-white">{value}</p>
              <p className="text-[10px] sm:text-xs text-slate-500 leading-tight">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, roll, room…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-500/60 transition-all"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {([
              { k: "all", label: "All" },
              { k: "not_checked", label: "Pending" },
              { k: "checked_in", label: "In" },
              { k: "checked_out", label: "Out" },
            ] as const).map(f => (
              <button key={f.k} onClick={() => setFilter(f.k)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                  filter === f.k
                    ? "bg-purple-600/20 text-purple-400 border-purple-500/30"
                    : "text-slate-500 border-white/8 hover:bg-white/5 hover:text-slate-300"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 ml-auto">{filtered.length} students</span>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No students" sub="No students match your filters" />
        ) : (
          <Table headers={["Student", "Roll No", "Room", "Status", "Inventory", "Action"]}>
            {filtered.map((s: any) => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors cursor-pointer" onClick={() => setSelected(s)}>
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
                <td className="px-4 py-3">{statusBadge(s)}</td>
                <td className="px-4 py-3">{invSummary(s)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={e => { e.stopPropagation(); setSelected(s); }}
                    className="text-xs px-2.5 py-1 bg-purple-600/15 hover:bg-purple-600/25 text-purple-400 border border-purple-500/25 rounded-lg transition-all"
                  >
                    Manage →
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {selected && (
        <StudentDetailPanel
          student={selected}
          onClose={() => setSelected(null)}
          onDataChanged={() => qc.invalidateQueries({ queryKey: QK })}
        />
      )}
    </div>
  );
}

// ─── Check-In Modal (Coord/Admin) ────────────────────────────────────────────
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
    try { await checkInMut.mutateAsync(studentId); } catch {}
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
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, roll, or email…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-500/60 transition-all"
              autoFocus />
          </div>
          <select value={hostelFilter} onChange={e => setHostelFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-purple-500/60 transition-all">
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
          ) : students.map((s: any) => {
            const isSuccess = successIds.has(s.id);
            const isChecking = checking === s.id;
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
                <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-purple-400 text-xs font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 truncate">{s.rollNumber || s.email}{s.roomNumber ? ` · Room ${s.roomNumber}` : ""}</p>
                </div>
                <button onClick={() => handleCheckIn(s.id)} disabled={isChecking || isSuccess}
                  className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all disabled:opacity-60 ${
                    isSuccess ? "bg-green-500/15 text-green-400 border-green-500/25" : "bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border-purple-500/30"
                  }`}>
                  {isChecking ? <Spinner size={12} /> : isSuccess ? "✓ Done" : "Check In"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Coordinator/Admin/SuperAdmin Attendance View ────────────────────────────
function CoordAttendance() {
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
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
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
      <PageHeader title="Attendance" subtitle="Check-in/out tracking for all students"
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

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "In Campus", value: inCampus, icon: CheckCircle, color: "text-green-400 bg-green-500/15" },
          { label: "Checked Out", value: checkedOut, icon: XCircle, color: "text-blue-400 bg-blue-500/15" },
          { label: "Total", value: (checkins as any[]).length, icon: ClipboardCheck, color: "text-purple-400 bg-purple-500/15" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold text-white">{value}</p>
              <p className="text-[10px] sm:text-xs text-slate-500 leading-tight">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-500" />
            <input type="date" value={allDates ? "" : date} max={today} disabled={allDates}
              onChange={e => setDate(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:border-purple-500/60 transition-all disabled:opacity-40" />
          </div>
          <button onClick={() => setAllDates(a => !a)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-all ${
              allDates ? "bg-purple-600/20 text-purple-400 border-purple-500/30" : "text-slate-400 border-white/8 hover:bg-white/5"
            }`}>
            <CalendarDays size={13} /> All Dates
          </button>
          <Select value={hostelFilter} onChange={setHostelFilter} className="min-w-40" disabled={isRestricted}>
            <option value="">All Hostels</option>
            {(hostels as any[]).map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}><RefreshCw size={13} /> Refresh</Button>
          <span className="text-xs text-slate-500 ml-auto">{(checkins as any[]).length} records</span>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : (checkins as any[]).length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No check-ins" sub="No students checked in for this date/filter" />
        ) : (
          <Table headers={["Student", "Hostel", "Room", "Check In", "Check Out", "Status", "Actions"]}>
            {(checkins as any[]).map((c: any) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-purple-400 text-[11px] font-bold">{(c.studentName || "?")[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{c.studentName}</p>
                      <p className="text-xs text-slate-500">{c.studentRoll || c.studentEmail}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-400">{c.hostelId || "—"}</td>
                <td className="px-4 py-3 text-sm text-slate-400">{c.studentRoom || "—"}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{fmt(c.checkInTime)}</td>
                <td className="px-4 py-3 text-sm text-slate-300">{fmt(c.checkOutTime)}</td>
                <td className="px-4 py-3">
                  {c.checkOutTime ? <Badge label="Checked Out" color="blue" /> : <Badge label="In Campus" color="green" />}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    {!c.checkOutTime ? (
                      <button onClick={() => checkoutMut.mutate(c.id)} disabled={checkoutMut.isPending}
                        className="text-xs px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-all disabled:opacity-50 flex items-center gap-1">
                        <LogOut size={11} /> Check Out
                      </button>
                    ) : (
                      <button onClick={() => revokeCheckoutMut.mutate(c.id)} disabled={revokeCheckoutMut.isPending}
                        className="text-xs px-2.5 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded-lg transition-all disabled:opacity-50">
                        Undo
                      </button>
                    )}
                    <button onClick={() => { if (confirm(`Revoke check-in for ${c.studentName}?`)) revokeCheckinMut.mutate(c.studentId); }}
                      disabled={revokeCheckinMut.isPending}
                      className="text-xs px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all disabled:opacity-50">
                      Revoke
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <CheckInModal visible={checkInModalOpen} onClose={() => setCheckInModalOpen(false)}
        hostels={hostels as any[]} onSuccess={() => refetch()} />
    </div>
  );
}

export default function Attendance() {
  const { user } = useAuth();
  if (user?.role === "volunteer") return <VolunteerAttendance />;
  return <CoordAttendance />;
}
