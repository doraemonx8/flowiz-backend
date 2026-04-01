import { Router } from "express";

import verifyJWT from "../authMiddleware";
import checkCrawlerLevel from "../middleware/checkCrawlLevel";
import { getLeadsFromGoogle,transferMasterAudience,getMasterLeadsFromGoogle,checkForAudience } from "../controllers/leadController";
import { 
  createLead, 
  deleteData, 
  getList, 
  getPrefill, 
  getAudienceList, 
  leadByAudience, 
  removeAudienceLead 
} from "../controllers/manualLeadController";

import { checkQuota } from "../middleware/quotaMiddleware";
const leadRouter=Router();

leadRouter.get('/google',verifyJWT, checkQuota('leads'),checkCrawlerLevel,getLeadsFromGoogle);
leadRouter.get('/google-master',verifyJWT, checkQuota('leads'),getMasterLeadsFromGoogle);
leadRouter.get('/transfer',verifyJWT, checkQuota('leads'),transferMasterAudience);
leadRouter.post('/check-audience',verifyJWT,checkForAudience);

leadRouter.post("/createLeads", verifyJWT, checkQuota('leads'), createLead);

leadRouter.delete("/removeData", verifyJWT, deleteData);
leadRouter.get("/leadsList", verifyJWT, getList);
leadRouter.get("/prefill", verifyJWT, getPrefill);
leadRouter.get("/leadAudience", verifyJWT, getAudienceList);
leadRouter.get("/leadByAudience", verifyJWT, leadByAudience);
leadRouter.get("/removeAudienceLead", verifyJWT, removeAudienceLead);

export default leadRouter;

