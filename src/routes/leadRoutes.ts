import { Router } from "express";

import verifyJWT from "../authMiddleware";
import checkCrawlLeadLimit from "../middleware/checkCrawlLeadLimit";
import checkCrawlerLevel from "../middleware/checkCrawlLevel";
import { getLeadsFromGoogle,transferMasterAudience,getMasterLeadsFromGoogle,checkForAudience } from "../controllers/leadController";

const leadRouter=Router();

leadRouter.get('/google',verifyJWT,checkCrawlLeadLimit,checkCrawlerLevel,getLeadsFromGoogle);
leadRouter.get('/google-master',verifyJWT,getMasterLeadsFromGoogle);
leadRouter.get('/transfer',verifyJWT,transferMasterAudience);
leadRouter.post('/check-audience',verifyJWT,checkForAudience);

export default leadRouter;

