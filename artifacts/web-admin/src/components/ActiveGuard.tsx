import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/ui";
import { WifiOff, Wifi, Loader2, X } from "lucide-react";

const STAFF_ROLES = ["volunteer", "coordinator", "admin", "superadmin"];

export function ActiveGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [remark, setRemark] = useState("");

  const isStaff = STAFF_ROLES.includes(user?.role || "");

  const { data: status, isLoading } = useQuery({
    queryKey: ["my-staff-status"],
    queryFn: () => apiFetch<any>("/staff/me-status"),
    refetchInterval: 15000,
    enabled: isStaff,
  });

  const goActiveMut = useMutation({
    mutationFn: (r: string) =>
      apiFetch("/staff/go-active", { method: "POST", body: JSON.stringify({ remark: r }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-staff-status"] });
      setShowModal(false);
      setRemark("");
    },
  });

  if (!isStaff) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center py-32">
        <Spinner size={28} />
      </div>
    );
  }

  const isActive = !!status?.isActive;

  if (!isActive) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center fade-in">
          <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center mb-5">
            <WifiOff size={36} className="text-slate-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">You're currently offline</h2>
          <p className="text-slate-500 text-sm max-w-xs mb-6 leading-relaxed">
            You need to mark yourself as <span className="text-white font-semibold">Active</span> before
            you can view or manage attendance and inventory data.
          </p>
          <button
            onClick={() => { setRemark(""); setShowModal(true); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-green-500/20"
          >
            <Wifi size={16} /> Go Active
          </button>
        </div>

        {showModal && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
            onClick={() => setShowModal(false)}
          >
            <div
              className="bg-[#0f0f13] border border-white/10 rounded-2xl w-full max-w-sm mx-4 p-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-white">Go Active</h2>
                <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Mark yourself as on-shift. Add a remark (optional).
              </p>
              <input
                autoFocus
                value={remark}
                onChange={e => setRemark(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") goActiveMut.mutate(remark || "Starting shift");
                  if (e.key === "Escape") setShowModal(false);
                }}
                placeholder="e.g. Starting hostel duty"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-green-500/60 mb-4 transition-all"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 rounded-xl border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => goActiveMut.mutate(remark || "Starting shift")}
                  disabled={goActiveMut.isPending}
                  className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {goActiveMut.isPending
                    ? <Loader2 size={14} className="animate-spin mx-auto" />
                    : "Go Active"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
}
