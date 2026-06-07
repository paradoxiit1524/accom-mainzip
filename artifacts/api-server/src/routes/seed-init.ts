import { Router } from "express";
import { initSchema } from "../initSchema.js";
import { autoSeed } from "../autoSeed.js";
import { importCsvData } from "../csvImportBulk.js";

const router = Router();

const SEED_KEY = process.env.SEED_SECRET || "campusops-seed-init-2024";

router.post("/seed-init", async (req, res) => {
  const key = req.headers["x-seed-key"] || req.body?.seedKey;
  if (key !== SEED_KEY) {
    return res.status(403).json({ error: "Forbidden", message: "Invalid seed key" });
  }
  try {
    console.log("[seed-init] Running schema init...");
    await initSchema();

    console.log("[seed-init] Running demo seed...");
    await autoSeed();

    console.log("[seed-init] Running CSV bulk import...");
    const csvResult = await importCsvData();

    return res.json({
      success: true,
      message: "Schema initialised, demo data seeded, and CSV data imported ✓",
      csv: csvResult,
    });
  } catch (err: any) {
    const msg = err?.message || JSON.stringify(err) || String(err) || "unknown error";
    console.error("[seed-init] Error:", msg);
    return res.status(500).json({ error: "Seed failed", message: msg, stack: err?.stack?.split("\n")[0] });
  }
});

export default router;
