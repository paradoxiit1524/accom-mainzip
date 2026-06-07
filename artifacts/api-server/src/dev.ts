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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Listening on port ${PORT}`);
  });

  if (SHOULD_AUTO_SEED) {
    autoSeed().catch((err) => console.error("[seed] Auto-seed failed:", err));
  }

  if (SHOULD_SEED_REAL) {
    productionSeed().catch((err) =>
      console.error("[prod-seed] Failed:", err)
    );
  }
});
