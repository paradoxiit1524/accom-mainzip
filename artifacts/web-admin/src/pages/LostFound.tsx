import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PageHeader, Card, Table, Badge, Button, Modal, Input, Select, EmptyState } from "@/components/ui";
import { PackageSearch, Plus, MapPin, AlertCircle } from "lucide-react";

const STATUS_MAP: Record<string, [string, "yellow" | "green" | "blue" | "gray"]> = {
  lost: ["Lost", "yellow"],
  found: ["Found", "green"],
  claimed: ["Claimed", "blue"],
};

export default function LostFound() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", location: "" });
  const [formError, setFormError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["lostitems"],
    queryFn: () => apiFetch<any[]>("/lostitems"),
    refetchInterval: 30000,
  });

  const addMut = useMutation({
    mutationFn: () => apiFetch("/lostitems", { method: "POST", body: JSON.stringify(form) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["lostitems"] }); setShowAdd(false); setForm({ title: "", description: "", location: "" }); },
    onError: (e: any) => setFormError(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/lostitems/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lostitems"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/lostitems/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lostitems"] }),
  });

  const filtered = items.filter((i: any) => !filterStatus || i.status === filterStatus);

  return (
    <div className="fade-in">
      <PageHeader
        title="Lost & Found"
        subtitle={`${items.length} items reported`}
        action={
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Report Item
          </Button>
        }
      />
      <Card>
        <div className="p-4 border-b border-white/8 flex gap-3">
          <Select value={filterStatus} onChange={setFilterStatus} className="min-w-36">
            <option value="">All Status</option>
            {Object.keys(STATUS_MAP).map((k) => <option key={k} value={k}>{STATUS_MAP[k][0]}</option>)}
          </Select>
          <span className="text-xs text-slate-500 self-center ml-auto">{filtered.length} items</span>
        </div>
        <Table
          headers={["Title", "Location", "Reported By", "Status", "Date", "Actions"]}
          loading={isLoading}
          empty={filtered.length === 0 ? "No items found" : undefined}
        >
          {filtered.map((item: any) => (
            <tr key={item.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
              <td className="px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-200">{item.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{item.description}</p>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <MapPin size={12} className="text-slate-600" />{item.location || "—"}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-400">{item.reporterName || item.reportedBy || "—"}</td>
              <td className="px-4 py-3">
                <Badge label={STATUS_MAP[item.status]?.[0] || item.status} color={STATUS_MAP[item.status]?.[1] || "gray"} />
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  {(["lost", "found", "claimed"] as const).filter((s) => s !== item.status).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateMut.mutate({ id: item.id, status: s })}
                      className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10 rounded-lg transition-all capitalize"
                    >
                      → {s}
                    </button>
                  ))}
                  <button
                    onClick={() => confirm("Delete this item?") && deleteMut.mutate(item.id)}
                    className="text-[10px] px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setFormError(""); }} title="Report Lost Item">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Item Title</label>
            <Input value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Blue water bottle" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the item…"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-purple-500/60 transition-all resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Location Found/Lost</label>
            <Input value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} placeholder="Near Bhadra common room" />
          </div>
          {formError && <p className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12} />{formError}</p>}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button loading={addMut.isPending} onClick={() => addMut.mutate()}>Report Item</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
