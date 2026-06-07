import type { Response } from "express";

export type SSEEvent =
  | "attendance_update"
  | "inventory_update"
  | "checkin_update"
  | "student_update"
  | "staff_update"
  | "announcement_update"
  | "lostitem_update";

class SSEBus {
  private clients = new Map<string, Response>();

  add(id: string, res: Response) {
    this.clients.set(id, res);
  }

  remove(id: string) {
    this.clients.delete(id);
  }

  emit(event: SSEEvent, data: Record<string, unknown> = {}) {
    if (this.clients.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify({ ts: Date.now(), ...data })}\n\n`;
    for (const [id, res] of this.clients) {
      try {
        if ((res as any).writableEnded || (res as any).destroyed) {
          this.clients.delete(id);
          continue;
        }
        res.write(payload);
        (res as any).flush?.();
      } catch {
        this.clients.delete(id);
      }
    }
  }

  get size() {
    return this.clients.size;
  }
}

export const sseBus = new SSEBus();
