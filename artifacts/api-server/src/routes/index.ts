import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storageRouter from "./storage";
import usersRouter from "./users";
import yachtsRouter from "./yachts";
import hostRouter from "./host";
import bookingsRouter from "./bookings";
import reviewsRouter from "./reviews";
import notificationsRouter from "./notifications";
import paymentsRouter from "./payments";
import adminRouter from "./admin";
import webhooksRouter from "./webhooks";
import internalRouter from "./internal";
import devRouter from "./dev";

const router: IRouter = Router();

// Health + auth (unauthenticated)
router.use(healthRouter);
router.use(authRouter);

// Webhooks — mount early, raw body already captured in app.ts
router.use(webhooksRouter);

// File storage
router.use(storageRouter);

// Domain routes
router.use(usersRouter);
router.use(yachtsRouter);
router.use(hostRouter);
router.use(bookingsRouter);
router.use(reviewsRouter);
router.use(notificationsRouter);
router.use(paymentsRouter);
router.use(adminRouter);
router.use(internalRouter);

// Dev-only shortcuts (not mounted in production)
if (process.env.NODE_ENV !== "production") {
  router.use(devRouter);
}

export default router;
