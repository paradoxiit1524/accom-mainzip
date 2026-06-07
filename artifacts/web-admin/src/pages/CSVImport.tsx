import React, { useState, useRef } from "react";
import { apiUpload, downloadFile } from "@/lib/api";
import { PageHeader, Card, Button, Badge } from "@/components/ui";
import { Upload, Download, CheckCircle, AlertCircle, FileText, Users, Home, Coffee, UserCog } from "lucide-react";

type ImportType = "students" | "mess" | "hostel-assignment" | "staff";

interface ImportResult { inserted?: number; updated?: number; errors?: string[]; message?: string }

const IMPORT_TYPES = [
  {
    id: "students" as ImportType,
    label: "Students",
    icon: Users,
    description: "Import student records (name, email, roll number, hostel, room)",
    endpoint: "/import/students",
    template: "/import/template/students",
    color: "purple",
  },
  {
    id: "mess" as ImportType,
    label: "Mess Allocation",
    icon: Coffee,
    description: "Assign students to mess (mess name by roll number)",
    endpoint: "/import/mess",
    template: "/import/template/mess",
    color: "blue",
  },
  {
    id: "hostel-assignment" as ImportType,
    label: "Hostel Assignment",
    icon: Home,
    description: "Assign students to hostels and rooms",
    endpoint: "/import/hostel-assignment",
    template: "/import/template/hostel-assignment",
    color: "green",
  },
  {
    id: "staff" as ImportType,
    label: "Staff Import",
    icon: UserCog,
    description: "Bulk import staff (volunteer, coordinator, admin, superadmin)",
    endpoint: "/import/staff",
    template: "/import/template/staff",
    color: "yellow",
  },
];

const COLOR_MAP: Record<string, string> = {
  purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  green: "bg-green-500/15 text-green-400 border-green-500/30",
  yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
};

export default function CSVImport() {
  const [active, setActive] = useState<ImportType>("students");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [purge, setPurge] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = IMPORT_TYPES.find((t) => t.id === active)!;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const url = active === "staff" ? `/import/staff${purge ? "?purge=true" : ""}` : current.endpoint;
      const res = await apiUpload<ImportResult>(url, fd);
      setResult(res);
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="fade-in">
      <PageHeader title="CSV Import" subtitle="Bulk import data from CSV files" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {IMPORT_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => { setActive(t.id); setResult(null); setError(""); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              active === t.id
                ? "bg-purple-600/15 border-purple-500/40 shadow-lg shadow-purple-500/10"
                : "bg-white/3 border-white/8 hover:bg-white/6 hover:border-white/15"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 border ${COLOR_MAP[t.color]}`}>
              <t.icon size={18} />
            </div>
            <p className={`text-sm font-bold ${active === t.id ? "text-purple-300" : "text-slate-300"}`}>{t.label}</p>
            <p className="text-xs text-slate-600 mt-0.5 leading-tight">{t.description}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${COLOR_MAP[current.color]}`}>
              <current.icon size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Import {current.label}</h2>
              <p className="text-xs text-slate-500">{current.description}</p>
            </div>
          </div>

          {active === "staff" && (
            <div className="mb-4 flex items-center gap-2.5 p-3 rounded-xl bg-red-500/8 border border-red-500/20">
              <input
                type="checkbox"
                id="purge"
                checked={purge}
                onChange={(e) => setPurge(e.target.checked)}
                className="accent-red-500"
              />
              <label htmlFor="purge" className="text-xs text-red-400 cursor-pointer">
                <span className="font-bold">Purge existing staff</span> — deletes all non-student staff before import (except you)
              </label>
            </div>
          )}

          <div
            className="border-2 border-dashed border-white/15 rounded-xl p-8 text-center cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/5 transition-all group"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} className="text-slate-600 group-hover:text-purple-400 mx-auto mb-3 transition-colors" />
            <p className="text-sm font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">
              {loading ? "Uploading…" : "Click to select CSV file"}
            </p>
            <p className="text-xs text-slate-600 mt-1">Only .csv files are accepted</p>
          </div>

          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />

          <div className="flex gap-2 mt-4">
            <Button variant="secondary" size="sm" onClick={() => downloadFile(current.template, `template-${active}.csv`)}>
              <Download size={13} /> Download Template
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={13} /> Upload CSV
            </Button>
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {result && (
            <Card className="p-5 border-green-500/20">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={18} className="text-green-400" />
                <h3 className="text-sm font-bold text-green-400">Import Successful</h3>
              </div>
              <div className="space-y-2">
                {result.inserted !== undefined && (
                  <p className="text-xs text-slate-300">✓ Inserted: <span className="text-green-400 font-bold">{result.inserted}</span></p>
                )}
                {result.updated !== undefined && (
                  <p className="text-xs text-slate-300">↻ Updated: <span className="text-yellow-400 font-bold">{result.updated}</span></p>
                )}
                {result.message && <p className="text-xs text-slate-400">{result.message}</p>}
                {result.errors && result.errors.length > 0 && (
                  <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                    <p className="text-xs font-semibold text-yellow-400 mb-1">Warnings ({result.errors.length}):</p>
                    {result.errors.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-[10px] text-yellow-400/70">{e}</p>
                    ))}
                    {result.errors.length > 5 && <p className="text-[10px] text-slate-600">+{result.errors.length - 5} more…</p>}
                  </div>
                )}
              </div>
            </Card>
          )}

          {error && (
            <Card className="p-5 border-red-500/20">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={18} className="text-red-400" />
                <h3 className="text-sm font-bold text-red-400">Import Failed</h3>
              </div>
              <p className="text-xs text-red-400/70">{error}</p>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText size={13} /> CSV Format for {current.label}
            </h3>
            <div className="space-y-1.5 text-xs text-slate-500">
              {active === "students" && <>
                <p>• <span className="text-slate-300">Name</span> — Full name</p>
                <p>• <span className="text-slate-300">Email</span> — Student email</p>
                <p>• <span className="text-slate-300">Roll Number</span> — Unique ID</p>
                <p>• <span className="text-slate-300">Hostel</span> — Hostel name</p>
                <p>• <span className="text-slate-300">Room Number</span> — Room</p>
                <p>• <span className="text-slate-300">Phone</span> — Contact number</p>
              </>}
              {active === "mess" && <>
                <p>• <span className="text-slate-300">Roll Number</span> — Student ID</p>
                <p>• <span className="text-slate-300">Mess</span> — Mess name</p>
              </>}
              {active === "hostel-assignment" && <>
                <p>• <span className="text-slate-300">Roll Number</span> — Student ID</p>
                <p>• <span className="text-slate-300">Hostel</span> — Hostel name</p>
                <p>• <span className="text-slate-300">Room Number</span> — Room</p>
              </>}
              {active === "staff" && <>
                <p>• <span className="text-slate-300">Email</span> — Staff email</p>
                <p>• <span className="text-slate-300">Name</span> — Full name</p>
                <p>• <span className="text-slate-300">Contact Number</span> — Phone</p>
                <p>• <span className="text-slate-300">Gender</span> — M/F/Other</p>
                <p>• <span className="text-slate-300">Role</span> — volunteer/coordinator/admin</p>
              </>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
