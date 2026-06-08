import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  RefreshControl, Platform, useColorScheme, ActivityIndicator, Linking,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, useApiRequest } from "@/context/AuthContext";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";

const go = (path: string) => router.push(path as any);

function StatBox({ label, value, color, theme }: { label: string; value: any; color: string; theme: any }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statVal, { color }]}>{value ?? "—"}</Text>
      <Text style={[styles.statLabel, { color: theme.textTertiary }]}>{label}</Text>
    </View>
  );
}

function QuickCard({ label, icon, color, onPress, badge }: {
  label: string; icon: string; color: string; onPress: () => void; badge?: number;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [styles.quickCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.quickIcon, { backgroundColor: color + "1A" }]}>
        <Feather name={icon as any} size={21} color={color} />
      </View>
      <Text style={[styles.quickLabel, { color: theme.text }]} numberOfLines={1}>{label}</Text>
      {!!badge && badge > 0 && (
        <View style={styles.quickBadge}>
          <Text style={styles.quickBadgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

function SectionCard({ icon, iconColor, title, sub, children, onViewAll }: {
  icon: string; iconColor: string; title: string; sub?: string;
  children: React.ReactNode; onViewAll?: () => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  return (
    <AnimatedCard style={[styles.card, { borderColor: iconColor + "28", borderWidth: 1.5 }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBox, { backgroundColor: iconColor + "1A" }]}>
          <Feather name={icon as any} size={17} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
          {sub && <Text style={[styles.cardSub, { color: theme.textSecondary }]}>{sub}</Text>}
        </View>
        {onViewAll && (
          <Pressable onPress={onViewAll} style={styles.viewAllBtn} hitSlop={8}>
            <Feather name="arrow-right" size={15} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>
      {children}
    </AnimatedCard>
  );
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { user, isCoordinator, isVolunteer, isSuperAdmin, isStudent } = useAuth();
  const request = useApiRequest();
  const qc = useQueryClient();
  const isWeb = Platform.OS === "web";
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveMeSnapshotRef = useRef<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveNow, setLiveNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setLiveNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ["auth-me-live-home"] });
      qc.invalidateQueries({ queryKey: ["att-stats"] });
      qc.invalidateQueries({ queryKey: ["mess-stats"] });
      qc.invalidateQueries({ queryKey: ["announcements"] });
      qc.invalidateQueries({ queryKey: ["my-status"] });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
      if (isStudent && user?.id) qc.invalidateQueries({ queryKey: ["student-self-live", user.id] });
    }, [qc, isStudent, user?.id])
  );

  const safe = React.useCallback(
    (fn: () => Promise<any>, fallback: any = null) => fn().catch(() => fallback),
    []
  );

  const { data: liveMe, refetch: refetchLiveMe } = useQuery<any>({
    queryKey: ["auth-me-live-home"],
    queryFn: () => safe(() => request("/auth/me"), null),
    enabled: !isStudent,
    refetchInterval: 5000,
    staleTime: 2000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const { data: studentSelf, refetch: refetchStudentSelf } = useQuery<any>({
    queryKey: ["student-self-live", user?.id],
    queryFn: () => safe(() => request(`/students/${user?.id}`), null),
    enabled: isStudent && !!user?.id,
    refetchInterval: 30000,
    staleTime: 15000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  useEffect(() => {
    if (liveMe && typeof liveMe === "object" && liveMe.id) {
      liveMeSnapshotRef.current = liveMe;
    }
  }, [liveMe]);

  const effectiveUser = (liveMe && typeof liveMe === "object" ? liveMe : null)
    || liveMeSnapshotRef.current
    || user;
  const effectiveRole = effectiveUser?.role || user?.role;
  const isAdmin = effectiveRole === "admin" || effectiveRole === "coordinator";

  const assignedHostelIds: string[] = React.useMemo(() => {
    try {
      const raw: any = effectiveUser?.assignedHostelIds;
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
      }
      return [];
    } catch { return []; }
  }, [effectiveUser?.assignedHostelIds]);

  const scopedHostelIds = React.useMemo(() => {
    if (isSuperAdmin) return null;
    if (effectiveRole === "volunteer") return [effectiveUser?.hostelId].filter(Boolean) as string[];
    if (assignedHostelIds.length > 0) return Array.from(new Set(assignedHostelIds));
    return [effectiveUser?.hostelId].filter(Boolean) as string[];
  }, [isSuperAdmin, effectiveRole, effectiveUser?.hostelId, assignedHostelIds]);

  const { data: announcements, refetch: refetchAnn, isLoading: annLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => safe(() => request("/announcements"), []),
    staleTime: 10000,
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const isStaff = isVolunteer || isCoordinator || isSuperAdmin;
  const { data: attStats, refetch: refetchStats } = useQuery({
    queryKey: ["att-stats"],
    queryFn: () => safe(() => request("/attendance/stats")),
    enabled: isStaff,
    refetchInterval: 15000,
    staleTime: 8000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const { data: reportSummary } = useQuery({
    queryKey: ["report-summary"],
    queryFn: () => safe(() => request("/reports/summary")),
    enabled: isCoordinator,
    refetchInterval: 30000,
    staleTime: 15000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const { data: scopedStudentsMeta } = useQuery<any>({
    queryKey: ["students-scope-total"],
    queryFn: () => safe(() => request("/students?limit=1&offset=0")),
    enabled: isCoordinator && !isSuperAdmin,
    refetchInterval: 60000,
    staleTime: 30000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const { data: messStats, refetch: refetchMess } = useQuery<any>({
    queryKey: ["mess-stats"],
    queryFn: () => safe(() => request("/mess-attendance/stats")),
    enabled: isStaff,
    refetchInterval: 15000,
    staleTime: 8000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const { data: myStatus, refetch: refetchStatus } = useQuery<{ isActive: boolean; lastActiveAt: string | null }>({
    queryKey: ["my-status"],
    queryFn: () => safe(() => request("/staff/me-status"), { isActive: false, lastActiveAt: null }),
    enabled: isVolunteer && !isSuperAdmin,
    refetchInterval: 15000,
    staleTime: 8000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const { data: pendingCount } = useQuery<{ count: number }>({
    queryKey: ["pending-count"],
    queryFn: () => safe(() => request("/approvals/count"), { count: 0 }),
    enabled: isSuperAdmin,
    refetchInterval: 30000,
    staleTime: 15000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const { data: allHostels = [] } = useQuery<any[]>({
    queryKey: ["hostels"],
    queryFn: () => safe(() => request("/hostels"), []),
    enabled: isAdmin || isVolunteer,
    refetchInterval: 120000,
    staleTime: 60000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const { data: allStaff = [] } = useQuery<any[]>({
    queryKey: ["staff-all-home"],
    queryFn: () => safe(() => request("/staff/all"), []),
    enabled: isVolunteer || isCoordinator,
    refetchInterval: 5000,
    staleTime: 3000,
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const assignedHostels = React.useMemo(() => {
    if (!Array.isArray(allHostels)) return [];
    return (allHostels as any[]).filter((h: any) => assignedHostelIds.includes(h.id));
  }, [allHostels, assignedHostelIds]);

  const profileHostelText = React.useMemo(() => {
    if (isSuperAdmin) return "All hostels";
    if (isStudent) return effectiveUser?.hostelId ? `Hostel ${effectiveUser.hostelId}` : "Hostel not assigned";
    if (isCoordinator) {
      if (assignedHostels.length > 0) return assignedHostels.map((h: any) => h.name).join(", ");
      if (assignedHostelIds.length > 0) return `${assignedHostelIds.length} assigned hostel(s)`;
      if (effectiveUser?.hostelId) return `Hostel ${effectiveUser.hostelId}`;
      return "No hostel assigned";
    }
    if (isVolunteer) {
      if (effectiveUser?.hostelId) {
        const own = (allHostels as any[]).find((h: any) => h.id === effectiveUser.hostelId);
        return own?.name || `Hostel ${effectiveUser.hostelId}`;
      }
      return "No hostel assigned";
    }
    return "";
  }, [isSuperAdmin, isStudent, isCoordinator, isVolunteer, assignedHostels, assignedHostelIds.length, effectiveUser?.hostelId, allHostels]);

  const volunteerHostelText = React.useMemo(() => {
    if (!isVolunteer) return "";
    if (!effectiveUser?.hostelId) return "No hostel assigned";
    const own = (allHostels as any[]).find((h: any) => h.id === effectiveUser.hostelId);
    return own?.name || `Hostel ${effectiveUser.hostelId}`;
  }, [isVolunteer, effectiveUser?.hostelId, allHostels]);

  // Show fellow staff/volunteers according to role:
  // - Superadmin: all staff
  // - Admin/Coordinator: all volunteers in assignedHostelIds
  // - Volunteer: other volunteers in their hostel
  const fellowStaff = React.useMemo(() => {
    // Helper: Only include staff who are currently assigned to the relevant hostel(s)
    const isCurrentAssignment = (staff: any, hostelIds: string[]) => {
      // Must have hostelId and assignedHostelIds matching
      if (!staff || !staff.hostelId) return false;
      return hostelIds.includes(String(staff.hostelId));
    };
    // Exclude self always
    const excludeSelf = (s: any) => String(s.id || "") !== String(effectiveUser?.id || "");
    // Add phone and isOnline fields
    const enrich = (s: any) => {
      const phone = s.contactNumber || s.phone || "";
      const isOnline = typeof s.isOnline === "boolean"
        ? s.isOnline
        : (s.lastActiveAt ? (Date.now() - new Date(s.lastActiveAt).getTime()) < 10 * 60 * 1000 : false);
      return { ...s, phone, isOnline };
    };
    if (isSuperAdmin) {
      // Only show staff with a current hostel assignment
      return (allStaff as any[])
        .filter((s: any) => s.hostelId)
        .filter(excludeSelf)
        .map(enrich);
    }
    if (isCoordinator || effectiveRole === "admin") {
      // Show all volunteers currently assigned to any of my assignedHostelIds
      return (allStaff as any[])
        .filter((s: any) => s.role === "volunteer" && isCurrentAssignment(s, assignedHostelIds))
        .filter(excludeSelf)
        .map(enrich);
    }
    if (isVolunteer && effectiveUser?.hostelId) {
      // Show all staff who work at the same hostel (volunteers, coordinators, admins)
      // Backend already scopes by hostel; we just exclude self here
      return (allStaff as any[])
        .filter(excludeSelf)
        .map(enrich);
    }
    return [];
  }, [isSuperAdmin, isCoordinator, isVolunteer, effectiveRole, effectiveUser?.hostelId, effectiveUser?.id, assignedHostelIds, allStaff]);

  const scopeLabel = isSuperAdmin ? "All hostels" : "Assigned hostels only";

  const { data: invStats } = useQuery<any>({
    queryKey: ["inv-stats"],
    queryFn: () => safe(() => request("/inventory-simple"), []),
    enabled: isCoordinator,
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });
  const invStatsArr = Array.isArray(invStats) ? invStats as any[] : [];
  const invScopedArr = React.useMemo(() => {
    if (!scopedHostelIds) return invStatsArr;
    if (scopedHostelIds.length === 0) return [];
    return invStatsArr.filter((s: any) => scopedHostelIds.includes(String(s.hostelId || "")));
  }, [invStatsArr, scopedHostelIds]);
  const invSubmitted = invScopedArr.filter(s => s.inventory?.inventoryLocked).length;
  const invTotal = invScopedArr.length;

  const activeStatusMutation = useMutation({
    mutationFn: ({ goActive, remark }: { goActive: boolean; remark?: string }) =>
      request(goActive ? "/staff/go-active" : "/staff/go-inactive", {
        method: "POST",
        body: JSON.stringify({ remark }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-status"] });
      qc.invalidateQueries({ queryKey: ["staff-all"] });
    },
  });

  useEffect(() => {
    if (!isVolunteer || isSuperAdmin || !myStatus?.isActive) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      return;
    }
    heartbeatRef.current = setInterval(async () => {
      try { await request("/staff/heartbeat", { method: "POST" }); } catch { }
    }, 5 * 60 * 1000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [isVolunteer, isSuperAdmin, myStatus?.isActive]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchLiveMe?.(), refetchAnn(), refetchStats?.(), refetchStatus?.(), refetchMess?.(), refetchStudentSelf?.()].filter(Boolean));
    setRefreshing(false);
  }, [refetchLiveMe, refetchAnn, refetchStats, refetchStatus, refetchMess, refetchStudentSelf]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const roleLabel = effectiveRole === "superadmin" ? "Super Admin"
    : effectiveRole === "admin" || effectiveRole === "coordinator" ? "Admin"
    : effectiveRole === "volunteer" ? "Volunteer"
    : "Student";

  const roleBadge = effectiveRole === "superadmin" ? "purple"
    : effectiveRole === "admin" || effectiveRole === "coordinator" ? "amber"
    : effectiveRole === "volunteer" ? "blue"
    : "green";

  // Client-side: if server says active but last heartbeat > 10 min ago, treat as expired
  const serverActive = myStatus?.isActive ?? false;
  const lastActiveMs = myStatus?.lastActiveAt ? new Date(myStatus.lastActiveAt).getTime() : 0;
  const clientExpired = serverActive && lastActiveMs > 0 && (liveNow - lastActiveMs) > 10 * 60 * 1000;
  const isActive = serverActive && !clientExpired;
  const requiresShift = user?.role === "volunteer" || user?.role === "admin" || user?.role === "coordinator";
  const canWork = !requiresShift || isActive;
  const pendingNum = pendingCount?.count ?? 0;

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: isWeb ? 80 : 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Header ───────────────────────────────────────────── */}
        <View style={[styles.hero, { paddingHorizontal: 20 }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.greeting, { color: theme.textSecondary }]}>{greeting()}</Text>
            <Text style={[styles.heroName, { color: theme.text }]} numberOfLines={1}>
              {effectiveUser?.name?.split(" ")[0] ?? user?.name?.split(" ")[0] ?? "..."}
            </Text>
            {!!profileHostelText && (isVolunteer || isAdmin) && (
              <Text style={[styles.heroHostel, { color: theme.textTertiary }]} numberOfLines={1}>{profileHostelText}</Text>
            )}
          </View>
          <Badge label={roleLabel} variant={roleBadge as any} />
        </View>

        {/* ── Shift Active banner (only when active) ───────────────── */}
        {requiresShift && isActive && (
          <View style={[styles.statusBanner, { backgroundColor: "#22c55e10", borderColor: "#22c55e40" }]}>
            <View style={[styles.statusDot, { backgroundColor: "#22c55e" }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusText, { color: "#22c55e" }]}>Shift Active</Text>
              <Text style={[styles.statusSub, { color: theme.textSecondary }]}>
                Auto-deactivates after 10 min without activity
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                activeStatusMutation.mutate({ goActive: false });
              }}
              disabled={activeStatusMutation.isPending}
              style={[styles.shiftBtn, { backgroundColor: "#ef444415", borderColor: "#ef444440" }]}
            >
              {activeStatusMutation.isPending
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <Text style={[styles.shiftBtnText, { color: "#ef4444" }]}>End Shift</Text>
              }
            </Pressable>
          </View>
        )}

        {/* ── Must Go Active — full-screen blocker ──────────────────── */}
        {requiresShift && !isActive && (
          <View style={[styles.activeBlocker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.activeBlockerIconWrap, { backgroundColor: "#f59e0b12" }]}>
              <Feather name="shield-off" size={44} color="#f59e0b" />
            </View>
            <Text style={[styles.activeBlockerTitle, { color: theme.text }]}>Shift Not Active</Text>
            <Text style={[styles.activeBlockerSub, { color: theme.textSecondary }]}>
              You must go active before you can view attendance, inventory, or hostel operations.
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                activeStatusMutation.mutate({ goActive: true, remark: "Started shift" });
              }}
              disabled={activeStatusMutation.isPending}
              style={styles.activeBlockerBtn}
            >
              {activeStatusMutation.isPending
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Feather name="zap" size={18} color="#fff" />
                    <Text style={styles.activeBlockerBtnText}>Go Active</Text>
                  </>
              }
            </Pressable>
            <Text style={[styles.activeBlockerHint, { color: theme.textTertiary }]}>
              Auto-deactivates after 10 min without activity
            </Text>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════
             VOLUNTEER (non-coordinator) view
            ══════════════════════════════════════════════════════════════ */}
        {isVolunteer && !isCoordinator && canWork && (
          <>
            {/* Attendance card */}
            <SectionCard
              icon="check-square"
              iconColor="#22c55e"
              title="Today's Attendance"
              sub={new Date().toDateString()}
              onViewAll={() => go("/(tabs)/attendance")}
            >
              {attStats ? (
                <View style={styles.statsRow}>
                  <StatBox label="Total" value={attStats.total} color={theme.text} theme={theme} />
                  <StatBox label="In Campus" value={attStats.entered} color="#22c55e" theme={theme} />
                  <StatBox label="Out" value={attStats.notEntered} color="#f59e0b" theme={theme} />
                </View>
              ) : <CardSkeleton />}
              <Pressable
                onPress={() => { Haptics.selectionAsync(); go("/(tabs)/attendance"); }}
                style={[styles.actionBtn, { backgroundColor: "#22c55e" }]}
              >
                <Feather name="check-square" size={15} color="#fff" />
                <Text style={styles.actionBtnText}>Mark Attendance & Inventory</Text>
              </Pressable>
            </SectionCard>

            {/* Mess Cards card */}
            <SectionCard
              icon="credit-card"
              iconColor="#f59e0b"
              title="Mess Cards"
              sub="Tap to distribute cards"
            >
              <View style={styles.statsRow}>
                <StatBox label="Given" value={messStats?.cardGivenCount ?? 0} color="#22c55e" theme={theme} />
                <StatBox label="Pending" value={(attStats?.total ?? 0) - (messStats?.cardGivenCount ?? 0)} color="#f59e0b" theme={theme} />
                <StatBox label="Total" value={attStats?.total ?? 0} color={theme.text} theme={theme} />
              </View>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); go("/(tabs)/mess-card"); }}
                style={[styles.actionBtn, { backgroundColor: "#f59e0b" }]}
              >
                <Feather name="credit-card" size={15} color="#fff" />
                <Text style={styles.actionBtnText}>Distribute Mess Cards</Text>
              </Pressable>
            </SectionCard>

            <SectionCard
              icon="users"
              iconColor="#8b5cf6"
              title="Fellow Working Members"
              sub={volunteerHostelText || "Same assigned hostel"}
              onViewAll={() => go("/admin/staff-status")}
            >
              {fellowStaff.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No other staff in this hostel</Text>
                </View>
              ) : (
                fellowStaff.slice(0, 5).map((s: any) => (
                  <View key={s.id} style={[styles.fellowRow, { borderBottomColor: theme.border }]}>
                    <View style={[styles.fellowDot, { backgroundColor: s.isOnline ? "#22c55e" : "#94a3b8" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fellowName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                      <Text style={[styles.fellowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {(s.role || "staff").toString().toUpperCase()} · {s.isOnline ? "Online" : "Offline"}
                      </Text>
                    </View>
                    <View style={styles.fellowActions}>
                      {s.phone ? (
                        <Pressable
                          onPress={() => {
                            Haptics.selectionAsync();
                            Linking.openURL(`tel:${s.phone}`);
                          }}
                          style={[styles.fellowBtn, { backgroundColor: "#22c55e15" }]}
                          hitSlop={8}
                        >
                          <Feather name="phone-call" size={13} color="#22c55e" />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          go("/admin/staff-status");
                        }}
                        style={[styles.fellowBtn, { backgroundColor: theme.tint + "18" }]}
                        hitSlop={8}
                      >
                        <Feather name="eye" size={13} color={theme.tint} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </SectionCard>

            {/* Quick grid */}
            <Text style={[styles.sectionLabel, { color: theme.textSecondary, paddingHorizontal: 20, marginBottom: 10 }]}>
              Quick Access
            </Text>
            <View style={styles.quickGrid}>
              <QuickCard label="Search" icon="search" color={theme.tint} onPress={() => go("/admin/search")} />
              <QuickCard label="Attendance" icon="check-square" color="#22c55e" onPress={() => go("/(tabs)/attendance")} />
              <QuickCard label="Inventory" icon="package" color="#f59e0b" onPress={() => go("/admin/inventory-table" as any)} />
              <QuickCard label="Mess Cards" icon="credit-card" color="#f59e0b" onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/mess-card' as any); }} />
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════
             COORDINATOR / ADMIN / SUPERADMIN view
            ══════════════════════════════════════════════════════════════ */}
        {isCoordinator && canWork && (
          <>
            {/* Superadmin pending approvals alert */}
            {isSuperAdmin && pendingNum > 0 && (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); go("/admin/approvals"); }}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, marginHorizontal: 20, marginBottom: 12 })}
              >
                <View style={[styles.pendingAlert, { backgroundColor: "#ef444412", borderColor: "#ef444440" }]}>
                  <View style={[styles.pendingAlertIcon, { backgroundColor: "#ef444420" }]}>
                    <Feather name="user-check" size={16} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pendingAlertTitle, { color: "#ef4444" }]}>
                      {pendingNum} Pending Approval{pendingNum > 1 ? "s" : ""}
                    </Text>
                    <Text style={[styles.pendingAlertSub, { color: theme.textSecondary }]}>
                      Tap to review and approve new registrations
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={15} color="#ef4444" />
                </View>
              </Pressable>
            )}

            {/* System Overview */}
            {reportSummary && (
              <SectionCard icon="bar-chart-2" iconColor={theme.tint} title="System Overview" sub={`${scopeLabel} · Live`}>
                <View style={styles.statsRow}>
                  <StatBox label="Students" value={isSuperAdmin ? reportSummary.totalStudents : Number(scopedStudentsMeta?.total ?? reportSummary.totalStudents ?? 0)} color={theme.tint} theme={theme} />
                  <StatBox label="Hostels" value={isSuperAdmin ? reportSummary.totalHostels : (scopedHostelIds?.length ?? 0)} color="#22c55e" theme={theme} />
                  <StatBox label="Alerts Sent" value={reportSummary.totalAnnouncements} color="#8b5cf6" theme={theme} />
                </View>
              </SectionCard>
            )}

            {/* Attendance */}
            {attStats && (
              <SectionCard
                icon="check-circle"
                iconColor="#22c55e"
                title="Room Attendance"
                sub={`Today · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                onViewAll={() => go("/(tabs)/attendance")}
              >
                <View style={styles.statsRow}>
                  <StatBox label="Total" value={attStats.total} color={theme.text} theme={theme} />
                  <StatBox label="In Campus" value={attStats.inCampus ?? attStats.entered} color="#22c55e" theme={theme} />
                  <StatBox label="Pending" value={attStats.pending ?? attStats.notEntered} color="#f59e0b" theme={theme} />
                </View>
                {(attStats.checkedOut ?? 0) > 0 && (
                  <View style={[styles.alertRow, { backgroundColor: "#6366f110", borderColor: "#6366f130" }]}>
                    <Feather name="log-out" size={12} color="#6366f1" />
                    <Text style={[styles.alertText, { color: "#6366f1" }]}>
                      {attStats.checkedOut} student{attStats.checkedOut !== 1 ? "s" : ""} checked out
                    </Text>
                  </View>
                )}
              </SectionCard>
            )}

            {/* Inventory */}
            <SectionCard
              icon="package"
              iconColor="#06b6d4"
              title="Inventory Status"
              sub={`Live · ${scopeLabel}`}
              onViewAll={() => go("/admin/inventory-table" as any)}
            >
              <View style={styles.statsRow}>
                <StatBox label="Total" value={invTotal} color={theme.text} theme={theme} />
                <StatBox label="Submitted" value={invSubmitted} color="#06b6d4" theme={theme} />
                <StatBox label="Pending" value={invTotal - invSubmitted} color="#f59e0b" theme={theme} />
              </View>
              {invTotal > 0 && invTotal - invSubmitted > 0 && (
                <View style={[styles.alertRow, { backgroundColor: "#fef3c710", borderColor: "#f59e0b40" }]}>
                  <Feather name="alert-triangle" size={12} color="#f59e0b" />
                  <Text style={[styles.alertText, { color: "#f59e0b" }]}>
                    {invTotal - invSubmitted} students have pending inventory
                  </Text>
                </View>
              )}
            </SectionCard>

            {/* Mess Cards */}
            <SectionCard
              icon="credit-card"
              iconColor="#22c55e"
              title="Mess Cards"
              sub="Live · Today"
              onViewAll={() => router.push('/(tabs)/mess-card' as any)}
            >
              <View style={styles.statsRow}>
                <StatBox label="Total" value={attStats?.total ?? messStats?.totalStudents ?? 0} color={theme.text} theme={theme} />
                <StatBox label="Given" value={messStats?.cardGivenCount ?? 0} color="#22c55e" theme={theme} />
                <StatBox label="Pending" value={(attStats?.total ?? messStats?.totalStudents ?? 0) - (messStats?.cardGivenCount ?? 0)} color="#f59e0b" theme={theme} />
              </View>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); go("/(tabs)/mess-card"); }}
                style={[styles.actionBtn, { backgroundColor: "#22c55e" }]}
              >
                <Feather name="credit-card" size={15} color="#fff" />
                <Text style={styles.actionBtnText}>Manage Mess Cards</Text>
              </Pressable>
            </SectionCard>

            {/* Fellow Working Members */}
            <SectionCard
              icon="users"
              iconColor="#8b5cf6"
              title="Fellow Working Members"
              sub={`Live · updates every 5s`}
              onViewAll={() => go("/admin/staff-status")}
            >
              {fellowStaff.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No other staff currently assigned</Text>
                </View>
              ) : (
                fellowStaff.slice(0, 6).map((s: any) => (
                  <View key={s.id} style={[styles.fellowRow, { borderBottomColor: theme.border }]}>
                    <View style={[styles.fellowDot, { backgroundColor: s.isOnline ? "#22c55e" : "#94a3b8" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fellowName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
                      <Text style={[styles.fellowMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                        {(s.role || "staff").toString().toUpperCase()} · {s.isOnline ? "Online" : "Offline"}
                      </Text>
                    </View>
                    <View style={styles.fellowActions}>
                      {s.phone ? (
                        <Pressable
                          onPress={() => { Haptics.selectionAsync(); Linking.openURL(`tel:${s.phone}`); }}
                          style={[styles.fellowBtn, { backgroundColor: "#22c55e15" }]}
                          hitSlop={8}
                        >
                          <Feather name="phone-call" size={13} color="#22c55e" />
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => { Haptics.selectionAsync(); go("/admin/staff-status"); }}
                        style={[styles.fellowBtn, { backgroundColor: theme.tint + "18" }]}
                        hitSlop={8}
                      >
                        <Feather name="eye" size={13} color={theme.tint} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </SectionCard>

            {/* Quick Grid */}
            <Text style={[styles.sectionLabel, { color: theme.textSecondary, paddingHorizontal: 20, marginBottom: 10 }]}>
              Quick Access
            </Text>
            <View style={styles.quickGrid}>
              <QuickCard label="Students" icon="users" color={theme.tint} onPress={() => go("/(tabs)/hostel")} />
              <QuickCard label="Attendance" icon="check-square" color="#22c55e" onPress={() => go("/(tabs)/attendance")} />
              <QuickCard label="Mess Cards" icon="credit-card" color="#f59e0b" onPress={() => { Haptics.selectionAsync(); router.push('/(tabs)/mess-card' as any); }} />
              <QuickCard label="Inventory" icon="package" color="#06b6d4" onPress={() => go("/admin/inventory-table" as any)} />
              <QuickCard label="Search" icon="search" color="#3b82f6" onPress={() => go("/admin/search")} />
              <QuickCard label="Staff" icon="activity" color="#8b5cf6" onPress={() => go("/admin/staff-status")} />
              <QuickCard label="Hostels" icon="home" color="#f59e0b" onPress={() => go("/admin/hostels")} />
              <QuickCard label="Post Alert" icon="volume-2" color="#ef4444" onPress={() => go("/admin/post-announcement")} />
              {isSuperAdmin && <>
                <QuickCard label="Approvals" icon="user-check" color="#ef4444" badge={pendingNum} onPress={() => go("/admin/approvals")} />
                <QuickCard label="Activity Logs" icon="clock" color="#06b6d4" onPress={() => go("/admin/activity-logs")} />
                <QuickCard label="CSV Import" icon="upload-cloud" color="#f59e0b" onPress={() => go("/admin/csv-import")} />
                <QuickCard label="Reports" icon="download" color="#ef4444" onPress={() => go("/admin/reports")} />
                <QuickCard label="Master Table" icon="database" color="#6366f1" onPress={() => go("/admin/master-table")} />
                <QuickCard label="Manage Admins" icon="user-plus" color="#8b5cf6" onPress={() => go("/admin/manage-admins")} />
              </>}
            </View>
          </>
        )}

        {/* ── Student Dashboard ─────────────────────────────────────── */}
        {isStudent && (() => {
          const sd = studentSelf || user;
          const isIn = sd?.attendanceStatus === "entered" || !!sd?.checkInTime;
          const attColor = isIn ? "#22c55e" : "#f59e0b";
          const attLabel = isIn ? "In Campus" : "Out of Campus";
          const fmtT = (iso: string | null | undefined) => {
            if (!iso) return "—";
            const d = new Date(iso);
            const h = d.getHours(), m = d.getMinutes();
            return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
          };
          const hasMessCard = !!sd?.messCardNo;
          const messCardGiven = !!sd?.messCard;
          return (
            <>
              {/* Campus Status */}
              <AnimatedCard style={[styles.card, { borderColor: attColor + "40", borderWidth: 1.5 }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconBox, { backgroundColor: attColor + "1A" }]}>
                    <Feather name={isIn ? "check-circle" : "clock"} size={17} color={attColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Campus Status</Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                      {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </Text>
                  </View>
                  <View style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 6 }, { backgroundColor: attColor + "15", borderColor: attColor + "50" }]}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: attColor }} />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: attColor }}>{attLabel}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 0, marginTop: 10 }}>
                  <View style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRightWidth: 1, borderRightColor: theme.border }}>
                    <Feather name="log-in" size={13} color="#22c55e" style={{ marginBottom: 3 }} />
                    <Text style={{ fontSize: 11, color: theme.textTertiary, fontFamily: "Inter_500Medium" }}>Check-In</Text>
                    <Text style={{ fontSize: 15, color: sd?.checkInTime ? "#22c55e" : theme.textSecondary, fontFamily: "Inter_700Bold", marginTop: 2 }}>{fmtT(sd?.checkInTime)}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
                    <Feather name="log-out" size={13} color="#f59e0b" style={{ marginBottom: 3 }} />
                    <Text style={{ fontSize: 11, color: theme.textTertiary, fontFamily: "Inter_500Medium" }}>Check-Out</Text>
                    <Text style={{ fontSize: 15, color: sd?.checkOutTime ? "#f59e0b" : theme.textSecondary, fontFamily: "Inter_700Bold", marginTop: 2 }}>{fmtT(sd?.checkOutTime)}</Text>
                  </View>
                </View>
              </AnimatedCard>

              {/* Student Details */}
              <AnimatedCard style={styles.card}>
                <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 10 }]}>My Details</Text>
                {[
                  { icon: "hash", label: "Roll Number", val: sd?.rollNumber },
                  { icon: "home", label: "Hostel", val: sd?.hostelName || sd?.hostelId },
                  { icon: "map-pin", label: "Room", val: sd?.roomNumber },
                  { icon: "layers", label: "Area", val: sd?.area },
                  { icon: "coffee", label: "Mess", val: sd?.assignedMess || sd?.allottedMess },
                  { icon: "phone", label: "Contact", val: sd?.contactNumber || sd?.phone },
                  { icon: "user", label: "Gender", val: sd?.gender },
                ].filter(r => r.val).map((r, i, arr) => (
                  <View key={r.label} style={[{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 }, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: theme.tint + "15", alignItems: "center", justifyContent: "center" }}>
                      <Feather name={r.icon as any} size={13} color={theme.tint} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: theme.textSecondary, fontFamily: "Inter_500Medium" }}>{r.label}</Text>
                    <Text style={{ fontSize: 13, color: theme.text, fontFamily: "Inter_600SemiBold", maxWidth: "55%" }} numberOfLines={1}>{r.val}</Text>
                  </View>
                ))}
                {!sd?.rollNumber && !sd?.hostelName && !sd?.hostelId && (
                  <View style={styles.emptyState}>
                    <Feather name="info" size={20} color={theme.textTertiary} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Details not assigned yet</Text>
                  </View>
                )}
              </AnimatedCard>

              {/* Mess Card */}
              <AnimatedCard style={[styles.card, hasMessCard && { borderColor: "#7c3aed40", borderWidth: 1.5 }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIconBox, { backgroundColor: hasMessCard ? "#7c3aed1A" : theme.tint + "1A" }]}>
                    <Feather name="credit-card" size={17} color={hasMessCard ? "#a78bfa" : theme.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Mess Card</Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                      {messCardGiven ? "Card has been issued to you" : "Card not yet issued"}
                    </Text>
                  </View>
                  <View style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 }, messCardGiven ? { backgroundColor: "#22c55e15", borderColor: "#22c55e40" } : { backgroundColor: theme.border + "60", borderColor: theme.border }]}>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: messCardGiven ? "#22c55e" : theme.textTertiary }}>{messCardGiven ? "Issued" : "Pending"}</Text>
                  </View>
                </View>
                {hasMessCard ? (
                  <View style={{ marginTop: 10, padding: 14, borderRadius: 12, backgroundColor: "#7c3aed15", borderWidth: 1, borderColor: "#7c3aed40", alignItems: "center" }}>
                    <Text style={{ fontSize: 11, color: "#a78bfa", fontFamily: "Inter_600SemiBold", letterSpacing: 1.2, marginBottom: 4 }}>MESS CARD NUMBER</Text>
                    <Text style={{ fontSize: 32, color: "#c4b5fd", fontFamily: "Inter_700Bold", letterSpacing: 4 }}>{sd?.messCardNo}</Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 8, padding: 12, borderRadius: 10, backgroundColor: theme.border + "30", alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: theme.textTertiary, fontFamily: "Inter_500Medium" }}>No card number assigned yet</Text>
                  </View>
                )}
              </AnimatedCard>

              {/* Quick Actions */}
              <Text style={[styles.sectionLabel, { color: theme.textSecondary, paddingHorizontal: 20, marginBottom: 10 }]}>
                Quick Access
              </Text>
              <View style={styles.quickGrid}>
                <QuickCard label="My Status" icon="activity" color={theme.tint} onPress={() => go("/(tabs)/attendance")} />
                <QuickCard label="Alerts" icon="bell" color="#8b5cf6" onPress={() => go("/(tabs)/notifications")} />
                <QuickCard label="Profile" icon="user" color="#22c55e" onPress={() => go("/(tabs)/profile")} />
              </View>
            </>
          );
        })()}

        {/* ── Announcements (all roles) ──────────────────────────────── */}
        {canWork && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary, paddingHorizontal: 20, marginBottom: 8, marginTop: 4 }]}>
              Announcements
            </Text>

            {annLoading ? (
              <View style={{ paddingHorizontal: 20 }}><CardSkeleton /><CardSkeleton /></View>
            ) : !announcements?.length ? (
              <AnimatedCard style={styles.card}>
                <View style={styles.emptyState}>
                  <Feather name="bell-off" size={28} color={theme.textTertiary} />
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No announcements</Text>
                </View>
              </AnimatedCard>
            ) : (
              announcements.slice(0, 5).map((a: any) => (
                <AnimatedCard key={a.id} style={styles.card}>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={[styles.annDot, { backgroundColor: theme.tint }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.annTitle, { color: theme.text }]}>{a.title}</Text>
                      <Text style={[styles.annBody, { color: theme.textSecondary }]} numberOfLines={2}>{a.content}</Text>
                      <Text style={[styles.annDate, { color: theme.textTertiary }]}>
                        {new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </Text>
                    </View>
                  </View>
                </AnimatedCard>
              ))
            )}
          </>
        )}
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  heroName: { fontSize: 26, fontFamily: "Inter_700Bold" },
  heroHostel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  statusBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 20, marginBottom: 14, padding: 14, borderRadius: 14, borderWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  statusSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  shiftBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  shiftBtnText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  pendingAlert: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  pendingAlertIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pendingAlertTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  pendingAlertSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  card: { marginHorizontal: 20, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  cardSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  viewAllBtn: { padding: 4 },
  statsRow: { flexDirection: "row", gap: 0, marginBottom: 2 },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statVal: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 10, borderRadius: 10, paddingVertical: 11 },
  actionBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, padding: 8, borderRadius: 8, borderWidth: 1 },
  alertText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  quickCard: { width: "22%", minWidth: 76, alignItems: "center", padding: 12, borderRadius: 14, borderWidth: 1, gap: 6, position: "relative" },
  quickIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center" },
  quickBadge: { position: "absolute", top: 6, right: 6, backgroundColor: "#ef4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  quickBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  assignedPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  assignedPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  annDot: { width: 3, borderRadius: 2, marginTop: 4, alignSelf: "stretch" },
  annTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  annBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  annDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  fellowRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  fellowDot: { width: 8, height: 8, borderRadius: 4 },
  fellowName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fellowMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  fellowActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  fellowBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  activeBlocker: { marginHorizontal: 20, marginTop: 8, marginBottom: 16, borderRadius: 20, borderWidth: 1, padding: 28, alignItems: "center", gap: 14 },
  activeBlockerIconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  activeBlockerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  activeBlockerSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },
  activeBlockerBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#22c55e", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, marginTop: 4, minWidth: 160, justifyContent: "center" },
  activeBlockerBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  activeBlockerHint: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
