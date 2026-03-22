import { Router } from "express";

import verifyJWT from "../authMiddleware";
import { checkQuota } from "../middleware/quotaMiddleware";
import {  createAudience,
  removeAudience,
  getAudienceList,
  getAudiencePrefill,
  getAudienceByLeadsHandler } from "../controllers/audienceController"; 

const audienceRouter=Router();

audienceRouter.post('/createAudience', checkQuota('audience'),verifyJWT,createAudience);
audienceRouter.delete('/removeData',verifyJWT,removeAudience);
audienceRouter.get('/prefill', verifyJWT, getAudiencePrefill);
audienceRouter.get('/audienceList',verifyJWT,getAudienceList);
audienceRouter.get('/audienceByleads',verifyJWT,getAudienceByLeadsHandler);

export default audienceRouter;

