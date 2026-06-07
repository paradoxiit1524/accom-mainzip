import app from "./app.js";
import { autoSeed } from "./autoSeed.js";
import { productionSeed } from "./productionSeed.js";
import { initSchema } from "./initSchema.js";

const PORT = Number(process.env.PORT) || 8080;
const SHOULD_AUTO_SEED = process.env.AUTO_SEED === "true";
const SHOULD_SEED_REAL = process.env.SEED_REAL_DATA === "true";

const maybeInit = process.env.DATABASE_URL
  ? initSchema().catch((err) =>
      console.error("[DB] Schema init failed:", err.message)
    )
  : Promise.resolve(
      console.warn("[DB] DATABASE_URL not set — skipping schema init.")
    );

maybeInit.then(() => {
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });

  server.on("error", (err: Error) => {
    console.error("[Server] Error:", err.message);
  });

  if (SHOULD_AUTO_SEED) {
    autoSeed().catch((err) => console.error("[seed] Auto-seed failed:", err));
  }

  if (SHOULD_SEED_REAL) {
    productionSeed().catch((err) =>
      console.error("[prod-seed] Failed:", err)
    );
  }

  // Keep the event loop alive so the process never exits on its own
  const _keepAlive = setInterval(() => {}, 30_000);

  process.on("SIGTERM", () => {
    console.log("[Server] SIGTERM received, shutting down gracefully...");
    clearInterval(_keepAlive);
    server.close(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    clearInterval(_keepAlive);
    server.close(() => process.exit(0));
  });
});
