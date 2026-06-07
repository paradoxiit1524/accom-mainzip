import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, getToken } from "@/lib/api";

const EVENT_KEYS: Record<string, string[][]> = {
  attendance_update: [["all-attendance"], ["att-stats"], ["attendance-stats"], ["active-staff"]],
  inventory_update:  [["inventory-all"], ["history-inventory"], ["all-attendance"], ["mess-students"], ["inv-students"]],
  checkin_update:    [["checkins"], ["history-checkins"], ["att-stats"]],
  student_update:    [["all-students"], ["master-table"]],
  staff_update:      [["all-staff"], ["active-staff"], ["reports-summary"]],
  announcement_update: [["announcements"]],
  lostitem_update:   [["lostitems"]],
};

export function useLiveSync() {
  const qc = useQueryClient();
  const esRef  = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    function connect() {
      if (!alive) return;
      const token = getToken();
      if (!token) return;

      const eventsUrl = `${API_BASE}/events?token=${encodeURIComponent(token)}`;
      const es = new EventSource(eventsUrl);
      esRef.current = es;

      for (const [event, keyGroups] of Object.entries(EVENT_KEYS)) {
        es.addEventListener(event, () => {
          keyGroups.forEach((key) => qc.invalidateQueries({ queryKey: key }));
        });
      }

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (alive) {
          retryRef.current = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      alive = false;
      esRef.current?.close();
      esRef.current = null;
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [qc]);
}
