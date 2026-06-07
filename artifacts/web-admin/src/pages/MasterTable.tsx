import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, downloadFile } from "@/lib/api";
import { PageHeader, Card, Input, Select, Button, Badge, Spinner, EmptyState } from "@/components/ui";
import { GraduationCap, Download, Search } from "lucide-react";

export default function MasterTable() {
  const [search, setSearch] = useState("");
  const [hostelFilter, setHostelFilter] = useState("");
  const [messFilter, setMessFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["master-students"],
    queryFn: () => apiFetch<{ students: any[]; total: number }>("/students?limit=5000"),
    refetchInterval: 60000,
  });
  const students: any[] = studentsData?.students ?? [];
  const { data: hostels = [] } = useQuery({ queryKey: ["hostels"], queryFn: () => apiFetch<any[]>("/hostels"), refetchInterval: 60000 });

  const hostelMap = useMemo(() => {
    const m: Record<string, string> = {};
    (hostels as any[]).forEach((h: any) => { m[h.id] = h.name; });
    return m;
  }, [hostels]);

  const messList = useMemo(() => [...new Set((students as any[]).map((s: any) => s.assignedMess).filter(Boolean))], [students]);

  const filtered = useMemo(() => (students as any[]).filter((s: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.name?.toLowerCase().includes(q) || s.rollNumber?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.roomNumber?.toLowerCase().includes(q);
    const matchHostel = !hostelFilter || s.hostelId === hostelFilter;
    const matchMess = !messFilter || s.assignedMess === messFilter;
    return matchSearch && matchHostel && matchMess;
  }), [students, search, hostelFilter, messFilter]);

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="fade-in">
      <PageHeader
        title="Master Table"
        subtitle={`${filtered.length} students across all hostels`}
        action={
          <Button variant="secondary" size="sm" onClick={() => downloadFile("/export/students.csv", "master-students.csv")}>
            <Download size={14} /> Export All
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Search by name, roll, room, email…" className="pl-9" />
          </div>
          <Select value={hostelFilter} onChange={(v) => { setHostelFilter(v); setPage(0); }} className="min-w-36">
            <option value="">All Hostels</option>
            {(hostels as any[]).map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
          <Select value={messFilter} onChange={(v) => { setMessFilter(v); setPage(0); }} className="min-w-32">
            <option value="">All Mess</option>
            {messList.map((m: any) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>

        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No students found" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    {["#", "Name", "Roll No", "Email", "Hostel", "Room", "Mess", "Phone", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((s: any, i: number) => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-600">{page * PAGE_SIZE + i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-purple-400 text-[10px] font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-200 whitespace-nowrap">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-mono">{s.rollNumber || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{s.email}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{hostelMap[s.hostelId] || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{s.roomNumber || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{s.assignedMess || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{s.phone || s.contactNumber || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge
                          label={s.attendanceStatus === "entered" ? "In" : s.attendanceStatus === "exited" ? "Out" : "Away"}
                          color={s.attendanceStatus === "entered" ? "green" : s.attendanceStatus === "exited" ? "blue" : "gray"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="p-4 border-t border-white/8 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
                  {Array.from({ length: Math.min(pages, 7) }).map((_, i) => {
                    const pg = pages <= 7 ? i : page < 4 ? i : page > pages - 4 ? pages - 7 + i : page - 3 + i;
                    return (
                      <button key={pg} onClick={() => setPage(pg)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${pg === page ? "bg-purple-600 text-white" : "text-slate-400 hover:bg-white/5"}`}>
                        {pg + 1}
                      </button>
                    );
                  })}
                  <Button variant="ghost" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next →</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
