// Quota Management Routes Endpoints for quota checking, usage tracking, and addon management

import express from "express";
import QuotaController from "../controllers/quotaController";
import verifyJWT from "../authMiddleware";

const router = express.Router();
// All routes require authentication
router.use(verifyJWT);

// GET /api/quota/check/:featureSlug Check if user has quota available for a feature
router.get("/check/:featureSlug", QuotaController.checkFeatureQuota);

// GET /api/quota/usage/:featureSlug Get detailed usage statistics for a feature
router.get("/usage/:featureSlug", QuotaController.getUsageStats);

 // GET /api/quota/dashboard Get complete usage dashboard for all features
router.get("/dashboard", QuotaController.getDashboard);

 // GET /api/quota/ledger/:featureSlug Get usage ledger entries for a feature
router.get("/ledger/:featureSlug", QuotaController.getLedger);

 // GET /api/quota/addons Get available addons
router.get("/addons", QuotaController.getAvailableAddons);

 // POST /api/quota/deduct Deduct usage (called after operation succeeds)
router.post("/deduct", QuotaController.deductUsage);

 // POST /api/quota/refund Refund usage (e.g., for cancelled operations)
router.post("/refund", QuotaController.refundUsage);

 // POST /api/quota/adjust (Admin only) Manually adjust quota - to be used later
//router.post("/adjust", QuotaController.adjustQuota);

export default router;
