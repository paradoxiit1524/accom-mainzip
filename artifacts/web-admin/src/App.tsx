import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLiveSync } from "@/hooks/useLiveSync";
import Layout, { type Page, NAV } from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/Students";
import Mess from "@/pages/Mess";
import Inventory from "@/pages/Inventory";
import Staff from "@/pages/Staff";
import Hostels from "@/pages/Hostels";
import Announcements from "@/pages/Announcements";
import CSVImport from "@/pages/CSVImport";
import ActivityLogs from "@/pages/ActivityLogs";
import Reports from "@/pages/Reports";
import MasterTable from "@/pages/MasterTable";
import ManageAdmins from "@/pages/ManageAdmins";
import History from "@/pages/History";
import Attendance from "@/pages/Attendance";
import { Spinner } from "@/components/ui";

const PAGES: Record<Page, React.ComponentType> = {
  dashboard: Dashboard,
  students: Students,
  attendance: Attendance,
  mess: Mess,
  inventory: Inventory,
  hostels: Hostels,
  staff: Staff,
  announcements: Announcements,
  "csv-import": CSVImport,
  "activity-logs": ActivityLogs,
  reports: Reports,
  "master-table": MasterTable,
  "manage-admins": ManageAdmins,
  history: History,
};

function AppInner() {
  const { user, isLoading } = useAuth();
  const [page, setPage] = useState<Page>("dashboard");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0f11]">
        <div className="text-center">
          <Spinner size={32} className="mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading CampusOps…</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return <AuthenticatedApp page={page} setPage={setPage} />;
}

function AuthenticatedApp({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  useLiveSync();
  const { user } = useAuth();
  const role = user?.role || "";

  useEffect(() => {
    const navItem = NAV.find(n => n.id === page);
    if (navItem?.roles && !navItem.roles.includes(role)) {
      setPage("dashboard");
    }
  }, [page, role, setPage]);

  const PageComponent = PAGES[page] || Dashboard;

  return (
    <Layout page={page} setPage={setPage}>
      <ErrorBoundary>
        <PageComponent />
      </ErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ErrorBoundary>
  );
}
