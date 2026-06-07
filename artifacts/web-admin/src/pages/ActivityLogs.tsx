import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { PageHeader, Card, Table, Input, Select, Button, Badge, EmptyState, Spinner } from "@/components/ui";
import { Activity, Download, Search, RefreshCw, X } from "lucide-react";

const TYPE_MAP: Record<string, [string, "purple" | "green" | "blue" | "yellow" | "gray" | "red"]> = {
  login: ["Login", "green"],
  logout: ["Logout", "gray"],
  active: ["Active", "blue"],
  inactive: ["Inactive", "gray"],
  checkin: ["Check-in", "purple"],
  checkout: ["Check-out", "blue"],
  "revoke-checkin": ["Revoke Check-in", "red"],
  "revoke-checkout": ["Revoke Check-out", "red"],
  "revoke-submit": ["Revoke Inventory", "red"],
  inventory: ["Inventory", "blue"],
  "mess-card": ["Mess Card", "yellow"],
  entry: ["Entry", "yellow"],
  assignment: ["Assignment", "purple"],
  custom: ["Custom", "gray"],
  screenshot: ["Screenshot", "red"],
};

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SHORT_HEX_RE = /\b[0-9a-f]{16,32}\b/gi;

function stripIds(text: string): string {
  return text
    .replace(UUID_RE, "")
    .replace(SHORT_HEX_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const TYPE_LABELS: Record<string, string> = {
  login: "Logged in",
  logout: "Logged out",
  active: "Marked self active",
  inactive: "Marked self inactive",
  checkin: "Checked in a student",
  checkout: "Checked out a student",
  "revoke-checkin": "Revoked student check-in",
  "revoke-checkout": "Revoked student check-out",
  "revoke-submit": "Revoked inventory submission",
  inventory: "Updated student inventory",
  "mess-card": "Updated mess card",
  entry: "Recorded entry",
  assignment: "Updated staff assignment",
  custom: "Custom action",
  screenshot: "Screenshot attempt detected",
};

export function formatNote(note: string | null | undefined, type: string): string {
  if (!note) return TYPE_LABELS[type] || type || "—";

  // Try JSON parse (assignment logs store JSON)
  try {
    const obj = JSON.parse(note);
    if (typeof obj === "object" && obj !== null) {
      if (type === "assignment") {
        const sentences: string[] = [];
        const fromRole = obj.from?.role;
        const toRole = obj.to?.role;
        if (fromRole && toRole && fromRole !== toRole) {
          sentences.push(`Role changed from ${fromRole} to ${toRole}.`);
        } else if (fromRole) {
          sentences.push(`Role remains ${fromRole}.`);
        }
        const fromHostels: string[] = obj.from?.assignedHostelIds || [];
        const toHostels: string[] = obj.to?.assignedHostelIds || [];
        if (JSON.stringify(fromHostels) !== JSON.stringify(toHostels)) {
          const fromCount = fromHostels.length;
          const toCount = toHostels.length;
          if (toCount > fromCount) {
            sentences.push(`Hostel assignment expanded to ${toCount} hostel${toCount !== 1 ? "s" : ""}.`);
          } else if (toCount < fromCount) {
            sentences.push(`Hostel assignment reduced to ${toCount} hostel${toCount !== 1 ? "s" : ""}.`);
          } else {
            sentences.push(`Hostel assignment updated.`);
          }
        }
        if (obj.to?.area) sentences.push(`Area set to ${obj.to.area}.`);
        return sentences.length > 0 ? sentences.join(" ") : "Staff assignment was updated.";
      }
      // Any other JSON object — return human-readable fallback
      return TYPE_LABELS[type] || type || "—";
    }
  } catch {
    // Not JSON — continue below
  }

  // Plain text notes: strip raw IDs and clean up
  const cleaned = stripIds(note);

  // Humanise common backend-generated patterns (old format used raw IDs)
  const patterns: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
    [/^Checked in\b/i, "Checked in"],
    [/^Checked out\b/i, "Checked out"],
    [/^Revoked check-?in\b/i, "Revoked check-in for"],
    [/^Revoked check-?out\b/i, "Revoked check-out for"],
    [/^Revoked checkout\b/i, "Revoked check-out for"],
    [/^Revoked inventory submission/i, "Revoked inventory submission"],
    [/^Revoked inventory/i, "Revoked inventory"],
    [/^Submitted (mattress|bedsheet|pillow)\b/i, (m: RegExpMatchArray) => `Submitted ${m[1]}`],
    [/^Gave mess card\b/i, "Gave mess card"],
    [/^Revoked mess card\b/i, "Revoked mess card"],
    [/^User login$/i, "Logged in"],
    [/^User logout$/i, "Logged out"],
  ];

  for (const [pattern, replacement] of patterns) {
    if (pattern.test(note)) {
      if (typeof replacement === "function") {
        const m = note.match(pattern);
        return m ? replacement(m) : cleaned;
      }
      return cleaned || (replacement as string);
    }
  }

  return cleaned || TYPE_LABELS[type] || type || "—";
}

function NoteModal({ log, onClose }: { log: any; onClose: () => void }) {
  const formatted = formatNote(log.note, log.type);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-[#0f0f13] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/8">
          <div>
            <p className="text-sm font-bold text-white">{log.userName || "Staff"}</p>
            <p className="text-xs text-slate-500">{log.userEmail}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Note / Remark</p>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{formatted}</p>
        </div>
      </div>
    </div>
  );
}

export default function ActivityLogs() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [limit, setLimit] = useState(100);
  const [modalLog, setModalLog] = useState<any>(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["staff-logs", limit, typeFilter],
    queryFn: () => apiFetch<any[]>(`/staff/logs?limit=${limit}${typeFilter ? `&type=${typeFilter}` : ""}`),
    refetchInterval: 20000,
  });

  const filtered = logs.filter((l: any) => {
    const q = search.toLowerCase();
    return !q || l.userName?.toLowerCase().includes(q) || l.note?.toLowerCase().includes(q);
  });

  return (
    <div className="fade-in">
      <PageHeader
        title="Activity Logs"
        subtitle="Real-time staff activity and check-in logs"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => downloadFile("/export/timelogs", "activity-logs.csv")}>
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => downloadFile("/pdf/activity-logs", "activity-logs.pdf")}>
              <Download size={14} /> PDF
            </Button>
          </div>
        }
      />

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={setSearch} placeholder="Search by name or note…" className="pl-9" />
          </div>
          <Select value={typeFilter} onChange={setTypeFilter} className="min-w-36">
            <option value="">All Types</option>
            {Object.keys(TYPE_MAP).map((k) => <option key={k} value={k}>{TYPE_MAP[k][0]}</option>)}
          </Select>
          <Select value={String(limit)} onChange={(v) => setLimit(Number(v))} className="min-w-36">
            <option value="50">50 records</option>
            <option value="100">100 records</option>
            <option value="250">250 records</option>
            <option value="500">500 records</option>
            <option value="1000">All records</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-slate-500">Live · {filtered.length} records</span>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Activity} title="No activity logs" sub="Activity will appear here in real-time" />
        ) : (
          <Table headers={["Staff Member", "Type", "Note", "Hostel", "Time"]}>
            {filtered.map((log: any) => {
              const [typeLabel, typeColor] = TYPE_MAP[log.type] || [log.type, "gray" as const];
              const formatted = formatNote(log.note, log.type);
              const isLong = formatted !== "—" && formatted.length > 80;
              return (
                <tr key={log.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-purple-400 text-[10px] font-bold">
                          {(log.userName || "?")[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{log.userName || "—"}</p>
                        <p className="text-xs text-slate-600">{log.userEmail || ""}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge label={typeLabel} color={typeColor} /></td>
                  <td className="px-4 py-3 max-w-xs">
                    {isLong ? (
                      <button onClick={() => setModalLog(log)} className="text-left group w-full">
                        <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                          {formatted.slice(0, 80)}
                          <span className="text-purple-400 group-hover:text-purple-300"> … expand</span>
                        </span>
                      </button>
                    ) : (
                      <span className="text-sm text-slate-400">{formatted}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{log.hostelName || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString("en-IN", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
                    }) : "—"}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {modalLog && <NoteModal log={modalLog} onClose={() => setModalLog(null)} />}
    </div>
  );
}
