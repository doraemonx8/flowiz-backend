import { Router } from "express";

import verifyJWT from "../authMiddleware";
import checkCrawlerLevel from "../middleware/checkCrawlLevel";
import { getLeadsFromGoogle,transferMasterAudience,getMasterLeadsFromGoogle,checkForAudience } from "../controllers/leadController";

import { checkQuota } from "../middleware/quotaMiddleware";
const leadRouter=Router();

leadRouter.get('/google',verifyJWT, checkQuota('leads'),checkCrawlerLevel,getLeadsFromGoogle);
leadRouter.get('/google-master',verifyJWT, checkQuota('leads'),getMasterLeadsFromGoogle);
leadRouter.get('/transfer',verifyJWT, checkQuota('leads'),transferMasterAudience);
leadRouter.post('/check-audience',verifyJWT,checkForAudience);

export default leadRouter;

