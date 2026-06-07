import cluster from "cluster";
import { cpus } from "os";
import app from "./app.js";
import { autoSeed } from "./autoSeed.js";
import { productionSeed } from "./productionSeed.js";
import { initSchema } from "./initSchema.js";

const PORT = Number(process.env.PORT) || 8080;
const WORKERS = process.env.NODE_ENV === "development" ? 1 : Math.min(cpus().length, 4);
const SHOULD_AUTO_SEED = process.env.AUTO_SEED === "true";
const SHOULD_SEED_REAL = process.env.SEED_REAL_DATA === "true";

if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} starting ${WORKERS} workers`);

  // ── Schema init: runs BEFORE forking so workers can safely use the DB ──────
  const maybeInit = process.env.DATABASE_URL
    ? initSchema().catch((err) =>
        console.error("[DB] Schema init failed:", err.message)
      )
    : Promise.resolve(
        console.warn("[DB] DATABASE_URL not set — skipping schema init.")
      );

  maybeInit.then(() => {
    for (let i = 0; i < WORKERS; i++) cluster.fork();
    cluster.on("exit", (worker) => {
      console.log(`[Cluster] Worker ${worker.process.pid} died — restarting…`);
      cluster.fork();
    });
  });
} else {
  // ── Worker: serve HTTP requests ─────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`[Worker ${process.pid}] Listening on port ${PORT}`);
  });

  // ── Seeds: only run in worker #1 to avoid race conditions ──────────────────
  const isFirstWorker = (cluster.worker?.id ?? 1) === 1;

  if (isFirstWorker && SHOULD_AUTO_SEED) {
    autoSeed().catch((err) => console.error("[seed] Auto-seed failed:", err));
  }

  if (isFirstWorker && SHOULD_SEED_REAL) {
    productionSeed().catch((err) =>
      console.error("[prod-seed] Failed:", err)
    );
  }
}
