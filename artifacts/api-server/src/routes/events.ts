import { Router } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sseBus } from "../lib/sse.js";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "";

// GET /api/events — SSE live-sync stream
// Token can come from Authorization header OR ?token= query param
// (EventSource API in browsers cannot set custom headers)
router.get("/", (req, res) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : (req.query.token as string | undefined);

  if (!token) {
    res.status(401).json({ error: "Unauthorized", message: "No token" });
    return;
  }

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid token" });
    return;
  }

  const clientId = crypto.randomBytes(8).toString("hex");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  sseBus.add(clientId, res);

  const ping = setInterval(() => {
    try {
      res.write(`:ping\n\n`);
    } catch {
      clearInterval(ping);
      sseBus.remove(clientId);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    sseBus.remove(clientId);
  });
});

export default router;
