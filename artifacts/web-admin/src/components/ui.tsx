import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";
import React from "react";

export function cn(...inputs: any[]) { return twMerge(clsx(inputs)); }

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn("animate-spin text-purple-400", className)} />;
}

export function Badge({ label, color }: { label: string; color: "green" | "yellow" | "red" | "blue" | "gray" | "purple" }) {
  const map = {
    green: "bg-green-500/15 text-green-400 border-green-500/25",
    yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
    red: "bg-red-500/15 text-red-400 border-red-500/25",
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    gray: "bg-slate-500/15 text-slate-400 border-slate-500/25",
    purple: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border", map[color])}>
      {label}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-[#161620] border border-white/8 rounded-xl", className)}>
      {children}
    </div>
  );
}

export function Button({
  children, onClick, variant = "primary", size = "md", disabled, loading, className, type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const base = "inline-flex items-center gap-2 font-semibold rounded-lg transition-all cursor-pointer border";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-base" };
  const variants = {
    primary: "bg-purple-600 hover:bg-purple-500 text-white border-purple-500/50 shadow-lg shadow-purple-500/20",
    secondary: "bg-white/5 hover:bg-white/10 text-slate-200 border-white/10",
    danger: "bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-500/30",
    ghost: "bg-transparent hover:bg-white/5 text-slate-400 border-transparent",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(base, sizes[size], variants[variant], (disabled || loading) && "opacity-50 cursor-not-allowed", className)}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Input({
  value, onChange, placeholder, type = "text", className, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all",
        className,
      )}
    />
  );
}

export function Select({
  value, onChange, children, className, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-purple-500/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Table({ headers, children, loading, empty }: {
  headers: string[];
  children: React.ReactNode;
  loading?: boolean;
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/8">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-white/5">
                {headers.map((h) => (
                  <td key={h} className="px-4 py-3">
                    <div className="h-4 bg-white/5 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))
          ) : children}
        </tbody>
      </table>
      {!loading && empty && (
        <div className="py-12 text-center text-slate-500 text-sm">{empty}</div>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = "max-w-lg" }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-[#161620] border border-white/10 rounded-2xl shadow-2xl w-full fade-in", width)}>
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h2 className="text-base font-bold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={cn("p-2.5 rounded-xl", color)}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </Card>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={40} className="text-slate-600 mb-3" />
      <p className="text-slate-400 font-semibold">{title}</p>
      {sub && <p className="text-slate-600 text-sm mt-1">{sub}</p>}
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const map: Record<string, [string, "purple" | "blue" | "green" | "yellow" | "gray" | "red"]> = {
    superadmin: ["Super Admin", "purple"],
    admin: ["Admin", "blue"],
    coordinator: ["Coordinator", "green"],
    volunteer: ["Volunteer", "yellow"],
    student: ["Student", "gray"],
    pending: ["Pending", "red"],
  };
  const [label, color] = map[role] || [role, "gray"];
  return <Badge label={label} color={color} />;
}
