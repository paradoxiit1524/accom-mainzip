import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PageHeader, Card, Table, Input, Button, Modal, EmptyState, Badge, Select } from "@/components/ui";
import { Megaphone, Plus, Trash2, Bell } from "lucide-react";

const CATEGORY_COLORS: Record<string, "purple" | "blue" | "green" | "red" | "gray"> = {
  general: "blue",
  urgent: "red",
  event: "green",
  maintenance: "gray",
};

export default function Announcements() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", category: "general" });
  const [formError, setFormError] = useState("");

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => apiFetch<any[]>("/announcements"),
    refetchInterval: 15000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch("/announcements", {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      setShowCreate(false);
      setForm({ title: "", content: "", category: "general" });
      setFormError("");
    },
    onError: (e: any) => setFormError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });

  function fmt(iso: string) {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Announcements"
        subtitle={`${(announcements as any[]).length} announcements · pushes to all student notifications`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Announcement
          </Button>
        }
      />

      <Card>
        <Table
          headers={["Announcement", "Category", "Posted By", "Date", "Actions"]}
          loading={isLoading}
          empty={(announcements as any[]).length === 0 ? "No announcements yet" : undefined}
        >
          {(announcements as any[]).map((a: any) => (
            <tr key={a.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
              <td className="px-4 py-3 max-w-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Megaphone size={14} className="text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.content}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge
                  label={a.category || "general"}
                  color={CATEGORY_COLORS[a.category] || "gray"}
                />
              </td>
              <td className="px-4 py-3">
                <p className="text-sm text-slate-300">{a.createdByName || "Admin"}</p>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">
                {fmt(a.createdAt)}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => confirm(`Delete "${a.title}"?`) && deleteMut.mutate(a.id)}
                  className="text-slate-600 hover:text-red-400 transition-colors p-1"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setFormError(""); }} title="New Announcement">
        <div className="space-y-4">
          <div className="flex items-start gap-3 bg-purple-600/10 border border-purple-500/20 rounded-xl p-3">
            <Bell size={14} className="text-purple-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-400">
              This announcement will be sent as a push notification to all students in your assigned hostel (coordinators+ send to all students).
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Title</label>
            <Input
              value={form.title}
              onChange={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder="e.g. Mess menu change today"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Write your announcement here…"
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-500/60 transition-all resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1.5 block">Category</label>
            <Select value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <option value="general">General</option>
              <option value="urgent">Urgent</option>
              <option value="event">Event</option>
              <option value="maintenance">Maintenance</option>
            </Select>
          </div>
          {formError && <p className="text-red-400 text-xs">{formError}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => { setShowCreate(false); setFormError(""); }}>Cancel</Button>
            <Button
              loading={createMut.isPending}
              onClick={() => createMut.mutate()}
              disabled={!form.title || !form.content}
            >
              <Megaphone size={14} /> Post Announcement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
