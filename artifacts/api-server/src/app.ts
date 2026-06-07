import express, {
  type Express,
  Request,
  Response,
  NextFunction,
} from "express";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";
import { existsSync } from "fs";
import router from "./routes/index.js";
import { sseBus, SSEEvent } from "./lib/sse.js";

// import.meta.dirname resolves to the directory of THIS file at runtime.
// In dev (tsx ESM):  artifacts/api-server/src/
// In prod (esbuild CJS bundle): artifacts/api-server/dist/
// Either way, ../../web-admin/dist correctly points to artifacts/web-admin/dist/
const WEB_ADMIN_DIST = path.resolve(import.meta.dirname, "../../web-admin/dist");

const app: Express = express();

// ✅ HEALTH CHECK — registered FIRST, before all middleware, so Railway/load
// balancers always get a response even if other parts of the app are still
// initialising or misconfigured. Also used as keep-alive ping target.
app.get("/api/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: "ok", ts: Date.now() });
});
app.get("/health", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: "ok", ts: Date.now() });
});
// Warm-up / keep-alive endpoint — lightweight DB ping to prevent cold starts
app.get("/api/ping", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ pong: true, ts: Date.now() });
});

// ✅ Trust proxy (important for Replit)
app.set("trust proxy", 1);

// ✅ Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));

// ✅ Compression
app.use(compression());

// ✅ CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Length"],
    credentials: false,
  }),
);

// ✅ Body parsers (512kb is plenty for a student app; 2mb was too permissive)
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

// ================= RATE LIMITERS =================

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests",
    message: "Please try again later",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many auth attempts",
    message: "Please wait before trying again",
  },
});

// ================= CACHE =================

app.use("/api/announcements", (req, res, next) => {
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "private, max-age=30");
  }
  next();
});

app.use("/api/hostels", (req, res, next) => {
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "private, max-age=60");
  }
  next();
});

// ================= ROUTES =================

// ✅ Apply auth limiter only to auth routes
app.use("/api/auth", authLimiter);

// ✅ Apply general limiter
app.use("/api", generalLimiter);

// ✅ SSE LIVE-SYNC EMITTER — registered BEFORE the router so res.on("finish")
// fires after every successful mutation and pushes the event to all SSE clients.
// IMPORTANT: req.path is mutated by nested routers — capture req.originalUrl NOW
// (before calling next) so the path is correct when the finish handler fires.
app.use("/api", (req, _res, next) => {
  const method = req.method.toUpperCase();
  if (!["POST", "PATCH", "DELETE", "PUT"].includes(method)) return next();

  const url = req.originalUrl; // frozen at entry — never mutated by child routers

  _res.on("finish", () => {
    if (_res.statusCode < 200 || _res.statusCode >= 300) return;
    let event: SSEEvent | null = null;

    if (/\/(inventory|mess-card|mess-attendance)/.test(url)) event = "inventory_update";
    else if (/\/attendance/.test(url))                        event = "attendance_update";
    else if (/\/checkins/.test(url))                         event = "checkin_update";
    else if (/\/students/.test(url))                         event = "student_update";
    else if (/\/import/.test(url))                           event = "student_update";
    else if (/\/staff/.test(url))                            event = "staff_update";
    else if (/\/admin/.test(url))                            event = "staff_update";
    else if (/\/announcements/.test(url))                    event = "announcement_update";
    else if (/\/lostitems/.test(url))                        event = "lostitem_update";

    if (event) sseBus.emit(event);
  });

  next();
});

// ✅ MAIN ROUTER
app.use("/api", router);

// ================= WEB ADMIN STATIC FILES (production only) =================

if (process.env.NODE_ENV === "production") {
  const distIndexHtml = path.join(WEB_ADMIN_DIST, "index.html");
  if (existsSync(distIndexHtml)) {
    app.use(express.static(WEB_ADMIN_DIST));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(distIndexHtml);
    });
  } else {
    console.warn("[web-admin] dist not found at", WEB_ADMIN_DIST, "— serving API only");
    app.get("/", (_req, res) => {
      res.json({ message: "CampusOps API Running 🚀", webAdmin: "not built" });
    });
  }
} else {
  app.get("/", (_req, res) => {
    res.json({ message: "CampusOps API Running 🚀" });
  });

  // ================= 404 HANDLER =================
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: "Not Found",
      message: "Route not found",
    });
  });
}

// ================= ERROR HANDLER =================

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]:", err);

  const status = err?.status || err?.statusCode || 500;

  res.status(status).json({
    error: status === 500 ? "Internal Server Error" : err?.name || "Error",
    message: err?.message || "Something went wrong",
  });
});

export default app;
