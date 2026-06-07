import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PageHeader, Card, Table, Input, Button, RoleBadge, Modal, Select, Spinner, EmptyState } from "@/components/ui";
import { UserCog, Plus, Search, Trash2, CheckCircle, XCircle, RefreshCw, Building2, Key, AlertTriangle, X, Edit2, Eye, EyeOff } from "lucide-react";

const ROLE_MAX_HOSTELS: Record<string, number> = {
  volunteer: 1,
  admin: 999,
  superadmin: 999,
};

function HostelBadges({ ids, hostels }: { ids: string[]; hostels: any[] }) {
  if (!ids || ids.length === 0) return <span className="text-slate-600 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id) => {
        const h = hostels.find((h: any) => h.id === id);
        return h ? (
          <span key={id} className="text-[10px] px-1.5 py-0.5 bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 rounded-md">
            {h.name}
          </span>
        ) : null;
      })}
    </div>
  );
}

export default function Staff() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "123456", role: "volunteer", contactNumber: "" });
  const [createError, setCreateError] = useState("");

  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [assignRole, setAssignRole] = useState("");
  const [assignHostelIds, setAssignHostelIds] = useState<string[]>([]);
  const [assignArea, setAssignArea] = useState("");
  const [assignError, setAssignError] = useState("");

  const [pwdTarget, setPwdTarget] = useState<any>(null);
  const [newPwd, setNewPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const { data: staff = [], isLoading, refetch } = useQuery({
    queryKey: ["all-staff"],
    queryFn: () => apiFetch<any[]>("/staff/all"),
    refetchInterval: 20000,
    staleTime: 15000,
  });

  const { data: activeList = [] } = useQuery({
    queryKey: ["active-staff"],
    queryFn: () => apiFetch<any[]>("/staff/active-list"),
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: hostels = [] } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => apiFetch<any[]>("/hostels"),
  });

  const activeIds = new Set((activeList as any[]).map((s: any) => s.id));

  const createMut = useMutation({
    mutationFn: (data: any) => apiFetch("/import/staff", {
      method: "POST",
      body: JSON.stringify({ rows: [{ Email: data.email, Name: data.name, Role: data.role, "Contact Number": data.contactNumber }] }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-staff"] }); setShowCreate(false); setCreateError(""); },
    onError: (e: any) => setCreateError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/admin-users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-staff"] }),
  });

  const assignMut = useMutation({
    mutationFn: ({ id, role, assignedHostelIds, area }: { id: string; role: string; assignedHostelIds: string[]; area: string }) =>
      apiFetch(`/admin/assign-hostel/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ role, assignedHostelIds, area }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-staff"] });
      setAssignTarget(null);
      setAssignError("");
    },
    onError: (e: any) => setAssignError(e.message),
  });

  const pwdMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiFetch(`/admin/reset-password/${id}`, { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: () => { setPwdTarget(null); setNewPwd(""); setPwdError(""); },
    onError: (e: any) => setPwdError(e.message),
  });

  const filtered = (staff as any[]).filter((s: any) => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q);
    const matchRole = !roleFilter || s.role === roleFilter;
    return matchSearch && matchRole;
  });

  const onlineCount = (staff as any[]).filter((s: any) => activeIds.has(s.id)).length;
  const totalCount = (staff as any[]).length;

  function openAssign(s: any) {
    setAssignTarget(s);
    setAssignRole(s.role);
    const ids: string[] = Array.isArray(s.assignedHostelIds) && s.assignedHostelIds.length > 0
      ? s.assignedHostelIds
      : s.hostelId ? [s.hostelId] : [];
    setAssignHostelIds(ids);
    setAssignArea(s.area || "");
    setAssignError("");
  }

  function toggleHostel(hid: string) {
    const max = ROLE_MAX_HOSTELS[assignRole] ?? 999;
    setAssignHostelIds((prev) => {
      if (prev.includes(hid)) return prev.filter((x) => x !== hid);
      if (prev.length >= max) {
        if (max === 1) return [hid];
        return prev;
      }
      return [...prev, hid];
    });
  }

  const maxForRole = ROLE_MAX_HOSTELS[assignRole] ?? 999;

  return (
    <div className="fade-in">
      <PageHeader
        title="Staff"
        subtitle={`${onlineCount} online · ${totalCount} total · live`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Add Staff
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b border-white/8 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input value={search} onChange={setSearch} placeholder="Search by name or email…" className="pl-9" />
          </div>
          <Select value={roleFilter} onChange={setRoleFilter} className="min-w-36">
            <option value="">All Roles</option>
            <option value="superadmin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="volunteer">Volunteer</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw size={13} /> Refresh
          </Button>
        </div>

        <Table
          headers={["Staff Member", "Role", "Status", "Assigned Hostels", "Last Active", "Actions"]}
          loading={isLoading}
          empty={filtered.length === 0 ? "No staff found" : undefined}
        >
          {filtered.map((s: any) => {
            const isOnline = activeIds.has(s.id);
            const assignedIds: string[] = Array.isArray(s.assignedHostelIds) && s.assignedHostelIds.length > 0
              ? s.assignedHostelIds
              : s.hostelId ? [s.hostelId] : [];
            return (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                        <span className="text-blue-400 text-xs font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161620] ${isOnline ? "bg-green-400" : "bg-slate-600"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><RoleBadge role={s.role} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {isOnline
                      ? <><CheckCircle size={13} className="text-green-400" /><span className="text-xs text-green-400 font-medium">Online</span></>
                      : <><XCircle size={13} className="text-slate-600" /><span className="text-xs text-slate-600">Offline</span></>}
                  </div>
                </td>
                <td className="px-4 py-3 max-w-[220px]">
                  <HostelBadges ids={assignedIds} hostels={hostels as any[]} />
                  {s.area && <p className="text-[10px] text-slate-500 mt-0.5">{s.area}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit" }) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openAssign(s)}
                      title="Manage Role & Hostels"
                      className="text-xs px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-all flex items-center gap-1"
                    >
                      <Edit2 size={11} /> Manage
                    </button>
                    <button
                      onClick={() => { setPwdTarget(s); setNewPwd(""); setPwdError(""); }}
                      title="Reset Password"
                      className="text-xs px-2 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded-lg transition-all flex items-center gap-1"
                    >
                      <Key size={11} />
                    </button>
                    <button
                      onClick={() => confirm(`Remove ${s.name}?`) && deleteMut.mutate(s.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors p-1"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>

      {/* Add Staff Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setCreateError(""); }} title="Add Staff Member">
        <div className="space-y-3">
          {[
            { label: "Full Name", key: "name", placeholder: "Dr. Sharma" },
            { label: "Email", key: "email", placeholder: "sharma@iitm.ac.in" },
            { label: "Contact Number", key: "contactNumber", placeholder: "+91 98765 43210" },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">{label}</label>
              <Input
                value={(createForm as any)[key]}
                onChange={(v) => setCreateForm((f) => ({ ...f, [key]: v }))}
                placeholder={placeholder}
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Role</label>
            <Select value={createForm.role} onChange={(v) => setCreateForm((f) => ({ ...f, role: v }))}>
              <option value="volunteer">Volunteer — 1 hostel</option>
              <option value="admin">Admin — all hostels</option>
              <option value="superadmin">Super Admin — full access</option>
            </Select>
          </div>
          {createError && <p className="text-red-400 text-xs">{createError}</p>}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button loading={createMut.isPending} onClick={() => createMut.mutate(createForm)}>
              Add Staff Member
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manage Role & Hostel Modal */}
      <Modal open={!!assignTarget} onClose={() => { setAssignTarget(null); setAssignError(""); }} title="Manage Role & Hostel Assignment" width="max-w-lg">
        {assignTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-white/3 rounded-xl p-3 border border-white/6">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-400 text-sm font-bold">{(assignTarget.name || "?")[0].toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">{assignTarget.name}</p>
                <p className="text-xs text-slate-500">{assignTarget.email}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Role</label>
              <Select value={assignRole} onChange={(v) => {
                setAssignRole(v);
                const max = ROLE_MAX_HOSTELS[v] ?? 999;
                if (max === 1 && assignHostelIds.length > 1) setAssignHostelIds(assignHostelIds.slice(0, 1));
              }}>
                <option value="volunteer">Volunteer — 1 hostel only</option>
                <option value="admin">Admin — all hostels</option>
                <option value="superadmin">Super Admin — full access</option>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-400">
                  Assigned Hostels
                  <span className="ml-2 text-slate-600 font-normal">
                    ({assignHostelIds.length} selected{maxForRole === 1 ? " — max 1" : ""})
                  </span>
                </label>
                {assignHostelIds.length > 0 && (
                  <button onClick={() => setAssignHostelIds([])} className="text-[10px] text-red-400 hover:text-red-300">
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {(hostels as any[]).map((h: any) => {
                  const selected = assignHostelIds.includes(h.id);
                  const atMax = !selected && maxForRole === 1 && assignHostelIds.length >= 1;
                  return (
                    <button
                      key={h.id}
                      onClick={() => !atMax && toggleHostel(h.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                        selected
                          ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300"
                          : atMax
                          ? "bg-white/2 border-white/5 text-slate-600 cursor-not-allowed opacity-50"
                          : "bg-white/3 border-white/8 text-slate-300 hover:bg-white/6 hover:border-white/15"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        selected ? "bg-indigo-500 border-indigo-400" : "border-white/20"
                      }`}>
                        {selected && <CheckCircle size={10} className="text-white" />}
                      </div>
                      <span className="text-sm flex-1">{h.name}</span>
                      {selected && <span className="text-[10px] text-indigo-400">✓</span>}
                    </button>
                  );
                })}
              </div>
              {assignHostelIds.length === 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400/70 bg-amber-500/8 rounded-lg p-2 border border-amber-500/15">
                  <AlertTriangle size={11} />
                  No hostel assigned — dashboard will show blank data for this user
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Area / Wing (optional)</label>
              <Input value={assignArea} onChange={setAssignArea} placeholder="e.g. Wing A, Block C…" />
            </div>

            {assignError && <p className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle size={11} />{assignError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => { setAssignTarget(null); setAssignError(""); }}>Cancel</Button>
              <Button
                loading={assignMut.isPending}
                onClick={() => assignMut.mutate({
                  id: assignTarget.id,
                  role: assignRole,
                  assignedHostelIds: assignHostelIds,
                  area: assignArea,
                })}
              >
                <Building2 size={14} /> Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!pwdTarget} onClose={() => { setPwdTarget(null); setNewPwd(""); setPwdError(""); setShowPwd(false); }} title="Reset Password">
        {pwdTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-white/3 rounded-xl p-3 border border-white/6">
              <Key size={18} className="text-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-200">{pwdTarget.name}</p>
                <p className="text-xs text-slate-500">{pwdTarget.email}</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">New Password</label>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={newPwd}
                  onChange={setNewPwd}
                  placeholder="Min 4 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {pwdError && <p className="text-red-400 text-xs">{pwdError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setPwdTarget(null)}>Cancel</Button>
              <Button
                loading={pwdMut.isPending}
                onClick={() => {
                  if (newPwd.length < 4) { setPwdError("Password must be at least 4 characters"); return; }
                  pwdMut.mutate({ id: pwdTarget.id, password: newPwd });
                }}
              >
                <Key size={14} /> Reset Password
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
