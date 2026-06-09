import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (req, res): Promise<void> => {
  let dbStatus = "ok";
  let httpStatus = 200;

  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    req.log.error({ err }, "DB health check failed");
    dbStatus = "error";
    httpStatus = 503;
  }

  res.status(httpStatus).json({
    status: dbStatus === "ok" ? "healthy" : "unhealthy",
    db: dbStatus,
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
