import { Router } from "express";
import verifyJWT from "../authMiddleware";
import { getCampainsData, getAgentPerformance, getRecentActivity } from "../controllers/dashboardController";

const dashboardRouter=Router();

dashboardRouter.get("/campaigns",verifyJWT,getCampainsData);
dashboardRouter.get('/agents',verifyJWT,getAgentPerformance);
dashboardRouter.get("/activity",verifyJWT,getRecentActivity);

export default dashboardRouter;