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
import locationsRouter from "./locations";
import discoveryRouter from "./discovery";
import wishlistRouter from "./wishlist";
import pushTokensRouter from "./pushTokens";
import cancellationPoliciesRouter from "./cancellationPolicies";
import adminCancellationsRouter from "./adminCancellations";
import adminLocationsRouter from "./adminLocations";
import adminYachtsMarketplaceRouter from "./adminYachtsMarketplace";
import adminActivityRouter from "./adminActivity";
import adminCampaignsRouter from "./adminCampaigns";
import supportConfigRouter from "./supportConfig";

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
router.use(locationsRouter);
router.use(discoveryRouter);
router.use(yachtsRouter);
router.use(hostRouter);
router.use(bookingsRouter);
router.use(reviewsRouter);
router.use(notificationsRouter);
router.use(paymentsRouter);
router.use(wishlistRouter);
router.use(pushTokensRouter);
router.use(cancellationPoliciesRouter);
router.use(adminCancellationsRouter);
router.use(adminLocationsRouter);
router.use(adminYachtsMarketplaceRouter);
router.use(adminActivityRouter);
router.use(adminCampaignsRouter);
router.use(supportConfigRouter);
router.use(adminRouter);
router.use(internalRouter);

// Dev-only shortcuts (not mounted in production)
if (process.env.NODE_ENV !== "production") {
  router.use(devRouter);
}

export default router;
