import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PageHeader, Card, Table, Button, RoleBadge, Badge, Modal, Input, Select, EmptyState, Spinner } from "@/components/ui";
import { FileText, Plus, Trash2, Check, X, RefreshCw, AlertCircle, Key, Building2, Edit2, AlertTriangle, CheckCircle, Eye, EyeOff } from "lucide-react";

const ROLE_MAX_HOSTELS: Record<string, number> = {
  volunteer: 1,
  admin: 999,
  superadmin: 999,
};

function HostelBadges({ ids, hostels }: { ids: string[]; hostels: any[] }) {
  if (!ids || ids.length === 0) return <span className="text-slate-600 text-xs">No hostel</span>;
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

export default function ManageAdmins() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "volunteer", contactNumber: "", gender: "" });
  const [formError, setFormError] = useState("");

  const [editTarget, setEditTarget] = useState<any>(null);
  const [editRole, setEditRole] = useState("");
  const [editHostelIds, setEditHostelIds] = useState<string[]>([]);
  const [editArea, setEditArea] = useState("");
  const [editError, setEditError] = useState("");

  const [pwdTarget, setPwdTarget] = useState<any>(null);
  const [newPwd, setNewPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [showBulkReset, setShowBulkReset] = useState(false);
  const [bulkResetDone, setBulkResetDone] = useState(false);

  const [approveRoles, setApproveRoles] = useState<Record<string, string>>({});

  const { data: pending = [], isLoading: loadingPending, refetch: refetchPending } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: () => apiFetch<any[]>("/approvals/pending"),
    refetchInterval: 30000,
  });

  const { data: staff = [], isLoading: loadingStaff, refetch: refetchStaff } = useQuery({
    queryKey: ["all-staff-manage"],
    queryFn: () => apiFetch<any[]>("/staff/all"),
    refetchInterval: 15000,
  });

  const { data: hostels = [] } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => apiFetch<any[]>("/hostels"),
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!form.name.trim() || form.name.trim().length < 2) throw new Error("Name must be at least 2 characters");
      if (!form.email.trim()) throw new Error("Email is required");
      if (form.password && form.password.length < 6) throw new Error("Password must be at least 6 characters");
      return apiFetch("/import/staff", {
        method: "POST",
        body: JSON.stringify({
          rows: [{
            Email: form.email.trim().toLowerCase(),
            Name: form.name.trim(),
            Role: form.role,
            "Contact Number": form.contactNumber,
            Gender: form.gender || "Other",
            Password: form.password.trim() || "123456",
          }],
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-staff-manage"] });
      setShowCreate(false);
      setFormError("");
      setForm({ name: "", email: "", password: "", role: "volunteer", contactNumber: "", gender: "" });
    },
    onError: (e: any) => setFormError(e.message),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiFetch(`/approvals/${id}/approve`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => { refetchPending(); refetchStaff(); },
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/approvals/${id}/reject`, { method: "DELETE" }),
    onSuccess: () => refetchPending(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/admin-users/${id}`, { method: "DELETE" }),
    onSuccess: () => refetchStaff(),
  });

  const editMut = useMutation({
    mutationFn: ({ id, role, assignedHostelIds, area }: { id: string; role: string; assignedHostelIds: string[]; area: string }) =>
      apiFetch(`/admin/assign-hostel/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ role, assignedHostelIds, area }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-staff-manage"] });
      setEditTarget(null);
      setEditError("");
    },
    onError: (e: any) => setEditError(e.message),
  });

  const pwdMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiFetch(`/admin/reset-password/${id}`, { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: () => { setPwdTarget(null); setNewPwd(""); setPwdError(""); },
    onError: (e: any) => setPwdError(e.message),
  });

  const bulkResetMut = useMutation({
    mutationFn: () => apiFetch("/auth/reset-all-passwords-to-prefix", { method: "POST" }),
    onSuccess: () => { setBulkResetDone(true); },
  });

  function openEdit(s: any) {
    setEditTarget(s);
    setEditRole(s.role);
    const ids: string[] = Array.isArray(s.assignedHostelIds) && s.assignedHostelIds.length > 0
      ? s.assignedHostelIds
      : s.hostelId ? [s.hostelId] : [];
    setEditHostelIds(ids);
    setEditArea(s.area || "");
    setEditError("");
  }

  function toggleHostel(hid: string) {
    const max = ROLE_MAX_HOSTELS[editRole] ?? 999;
    setEditHostelIds((prev) => {
      if (prev.includes(hid)) return prev.filter((x) => x !== hid);
      if (prev.length >= max) {
        if (max === 1) return [hid];
        return prev;
      }
      return [...prev, hid];
    });
  }

  const maxForRole = ROLE_MAX_HOSTELS[editRole] ?? 999;

  return (
    <div className="fade-in space-y-6">
      <PageHeader
        title="Manage Staff"
        subtitle="Create, approve, and manage staff accounts with role & hostel control"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowBulkReset(true)}>
              <Key size={13} /> Bulk Reset
            </Button>
            <Button variant="secondary" onClick={() => { setShowApprovals(true); refetchPending(); }}>
              Pending {(pending as any[]).length > 0 && (
                <span className="bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {(pending as any[]).length}
                </span>
              )}
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Add Staff
            </Button>
          </div>
        }
      />

      <Card>
        <div className="p-4 border-b border-white/8 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-300">All Staff Members</h2>
          <Button variant="ghost" size="sm" onClick={() => refetchStaff()}>
            <RefreshCw size={13} /> Refresh
          </Button>
        </div>
        <Table
          headers={["Name", "Role", "Assigned Hostels", "Joined", "Actions"]}
          loading={loadingStaff}
          empty={(staff as any[]).length === 0 ? "No staff members found" : undefined}
        >
          {(staff as any[]).map((s: any) => {
            const assignedIds: string[] = Array.isArray(s.assignedHostelIds) && s.assignedHostelIds.length > 0
              ? s.assignedHostelIds
              : s.hostelId ? [s.hostelId] : [];
            return (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                      <span className="text-blue-400 text-xs font-bold">{(s.name || "?")[0].toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><RoleBadge role={s.role} /></td>
                <td className="px-4 py-3 max-w-[220px]">
                  <HostelBadges ids={assignedIds} hostels={hostels as any[]} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-IN") : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openEdit(s)}
                      title="Edit Role & Hostels"
                      className="text-xs px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg transition-all flex items-center gap-1"
                    >
                      <Edit2 size={11} /> Edit
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
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setFormError(""); }} title="Add Staff Member">
        <div className="space-y-3">
          {[
            { label: "Full Name", key: "name", placeholder: "Dr. Rajesh Kumar" },
            { label: "Email", key: "email", placeholder: "rajesh@iitm.ac.in" },
            { label: "Contact Number", key: "contactNumber", placeholder: "+91 98765 43210" },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">{label}</label>
              <Input value={(form as any)[key]} onChange={(v) => setForm((f) => ({ ...f, [key]: v }))} placeholder={placeholder} />
            </div>
          ))}
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">
              Password <span className="text-slate-600 font-normal">(leave blank → default: 123456)</span>
            </label>
            <div className="relative">
              <Input
                type={showCreatePwd ? "text" : "password"}
                value={form.password}
                onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                placeholder="Min 6 characters"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCreatePwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                {showCreatePwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Role</label>
            <Select value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <option value="volunteer">Volunteer — 1 hostel</option>
              <option value="admin">Admin — all hostels</option>
              <option value="superadmin">Super Admin — full access</option>
            </Select>
          </div>
          {formError && (
            <div className="flex items-center gap-1.5 text-red-400 text-xs">
              <AlertCircle size={12} />{formError}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button loading={createMut.isPending} onClick={() => createMut.mutate()}>Create Account</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Role & Hostel Modal */}
      <Modal open={!!editTarget} onClose={() => { setEditTarget(null); setEditError(""); }} title="Edit Role & Hostel Assignment" width="max-w-lg">
        {editTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-white/3 rounded-xl p-3 border border-white/6">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-400 text-sm font-bold">{(editTarget.name || "?")[0].toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">{editTarget.name}</p>
                <p className="text-xs text-slate-500">{editTarget.email}</p>
              </div>
              <RoleBadge role={editTarget.role} />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Role</label>
              <Select value={editRole} onChange={(v) => {
                setEditRole(v);
                const max = ROLE_MAX_HOSTELS[v] ?? 999;
                if (max === 1 && editHostelIds.length > 1) setEditHostelIds(editHostelIds.slice(0, 1));
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
                    ({editHostelIds.length} selected{maxForRole === 1 ? " — max 1" : ""})
                  </span>
                </label>
                {editHostelIds.length > 0 && (
                  <button onClick={() => setEditHostelIds([])} className="text-[10px] text-red-400 hover:text-red-300">Clear all</button>
                )}
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {(hostels as any[]).map((h: any) => {
                  const selected = editHostelIds.includes(h.id);
                  const atMax = !selected && maxForRole === 1 && editHostelIds.length >= 1;
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
              {editHostelIds.length === 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400/70 bg-amber-500/8 rounded-lg p-2 border border-amber-500/15">
                  <AlertTriangle size={11} />
                  No hostel assigned — this user's dashboard will show no data
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Area / Wing (optional)</label>
              <Input value={editArea} onChange={setEditArea} placeholder="e.g. Wing A, Block C…" />
            </div>

            {editError && <p className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle size={11} />{editError}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button
                loading={editMut.isPending}
                onClick={() => editMut.mutate({ id: editTarget.id, role: editRole, assignedHostelIds: editHostelIds, area: editArea })}
              >
                <Building2 size={14} /> Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!pwdTarget} onClose={() => { setPwdTarget(null); setNewPwd(""); setPwdError(""); }} title="Reset Password">
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
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setPwdTarget(null); setShowPwd(false); }}>Cancel</Button>
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

      {/* Bulk Reset Modal */}
      <Modal open={showBulkReset} onClose={() => { setShowBulkReset(false); setBulkResetDone(false); }} title="Bulk Password Reset">
        <div className="space-y-4">
          {bulkResetDone ? (
            <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-xl border border-green-500/20">
              <CheckCircle size={20} className="text-green-400" />
              <div>
                <p className="text-sm font-bold text-green-400">Done!</p>
                <p className="text-xs text-slate-400">All passwords reset to email prefix (e.g. john for john@iitm.ac.in)</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-red-400">Destructive action</p>
                  <p className="text-xs text-slate-400 mt-1">
                    This will reset ALL staff passwords to their email prefix. For example, <span className="text-slate-300">john@iitm.ac.in</span> → password becomes <span className="text-slate-300">john</span>.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowBulkReset(false)}>Cancel</Button>
                <Button variant="danger" loading={bulkResetMut.isPending} onClick={() => bulkResetMut.mutate()}>
                  <Key size={14} /> Reset All Passwords
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Pending Approvals Modal */}
      <Modal open={showApprovals} onClose={() => setShowApprovals(false)} title={`Pending Approvals (${(pending as any[]).length})`} width="max-w-2xl">
        {loadingPending ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : (pending as any[]).length === 0 ? (
          <EmptyState icon={Check} title="No pending approvals" sub="All registration requests have been reviewed" />
        ) : (
          <div className="space-y-3">
            {(pending as any[]).map((p: any) => (
              <div key={p.id} className="p-4 bg-white/3 rounded-xl border border-white/8 flex items-center gap-3 flex-wrap">
                <div className="w-9 h-9 rounded-full bg-yellow-600/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-yellow-400 text-sm font-bold">{(p.name || "?")[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-200">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.email} · Roll: {p.rollNumber || "—"}</p>
                  <p className="text-xs text-slate-600">{p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : ""}</p>
                </div>
                <Select
                  value={approveRoles[p.id] || "volunteer"}
                  onChange={(v) => setApproveRoles((r) => ({ ...r, [p.id]: v }))}
                  className="min-w-32"
                >
                  <option value="volunteer">Volunteer</option>
                  <option value="admin">Admin</option>
                </Select>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => approveMut.mutate({ id: p.id, role: approveRoles[p.id] || "volunteer" })}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/25 rounded-lg text-xs font-semibold transition-all"
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    onClick={() => rejectMut.mutate(p.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/25 rounded-lg text-xs font-semibold transition-all"
                  >
                    <X size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
