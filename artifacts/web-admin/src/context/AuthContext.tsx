import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiFetch, getToken, setToken, clearToken } from "@/lib/api";

export type UserRole = "student" | "volunteer" | "coordinator" | "admin" | "superadmin" | "pending";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  hostelId?: string;
  hostelName?: string;
  assignedHostelIds?: string;
  createdAt?: string;
}

interface AuthCtx {
  user: AdminUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [token, setTok] = useState<string | null>(getToken());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (t) {
      apiFetch<AdminUser>("/auth/me")
        .then((u) => { setUser(u); setTok(t); })
        .catch(() => { clearToken(); setTok(null); })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ token: string; user: AdminUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    if (data.user.role === "student" || data.user.role === "pending") {
      throw new Error("This portal is for staff only. Students should use the mobile app.");
    }
    setToken(data.token);
    setTok(data.token);
    setUser(data.user);
  }

  function logout() {
    clearToken();
    setTok(null);
    setUser(null);
  }

  return <Ctx.Provider value={{ user, token, isLoading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
