/**
 * callRoutes.ts
 *
 * Routes for Python call server → Flowiz TypeScript backend callbacks.
 * No JWT required — Python uses an internal shared secret header instead.
 */

import { Router, Request, Response, NextFunction } from "express";
import verifyJWT from "../authMiddleware";
import {
  sessionCreated,
  saveCallIntents,
  saveCallSummary,
  callEnded,
  getCallChat,
  getCallAnalysis,
} from "../controllers/callController";

const callRouter = Router();

// Simple shared-secret guard so only the Python server can call these endpoints.
// Set CALL_INTERNAL_SECRET in both .env files to the same value.
const internalOnly = (req: Request, res: Response, next: NextFunction): any => {
  const secret = process.env.CALL_INTERNAL_SECRET;
  if (!secret) return next(); // dev: skip if not configured
  if (req.headers["x-internal-secret"] !== secret) {
    return res.status(401).json({ status: false, message: "Unauthorized" });
  }
  return next();
};

// ── Python → Flowiz callbacks ─────────────────────────────────────────────────
callRouter.post("/session-created", internalOnly, sessionCreated);
callRouter.post("/save-intents",    internalOnly, saveCallIntents);
callRouter.post("/save-summary",    internalOnly, saveCallSummary);
callRouter.post("/call-ended",      internalOnly, callEnded);

// ── Flowiz → Python (lookup) ──────────────────────────────────────────────────
callRouter.get("/chat",     internalOnly, getCallChat);

// ── Frontend (JWT protected) ──────────────────────────────────────────────────
callRouter.get("/analysis", verifyJWT,    getCallAnalysis);

export default callRouter;