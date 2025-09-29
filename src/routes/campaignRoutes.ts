import { Router } from "express";
import{scheduleCampaign,pauseCampaign,resumeCampaign,cancelCampaign,getProgress,getCampaignStatus,getCampaignResult,getCampaigns,deleteCampaign,editCampaignName} from "../controllers/campaignController";

import verifyJWT from "../authMiddleware";
import validateCampaign from "../middleware/validateCampaign";
import createSubFlowsForCampaign from "../middleware/createSubFlowsForCampaign";
import validateEmailAgent from "../middleware/emailAgent";
import validateCampaignTime from "../middleware/campaignTime";


const campaignRouter = Router();


campaignRouter.post('/schedule', verifyJWT,validateCampaign,createSubFlowsForCampaign,validateEmailAgent,validateCampaignTime,scheduleCampaign);
campaignRouter.post('/pause', verifyJWT, pauseCampaign);
campaignRouter.post('/resume',verifyJWT,resumeCampaign);
campaignRouter.post('/cancel',verifyJWT,cancelCampaign);
campaignRouter.get('/progress',verifyJWT,getProgress);
campaignRouter.get("/status",verifyJWT,getCampaignStatus);
campaignRouter.get('/',verifyJWT,getCampaignResult);
campaignRouter.get('/all',verifyJWT,getCampaigns);
campaignRouter.post('/delete',verifyJWT,deleteCampaign);
campaignRouter.post('/update-name',verifyJWT,editCampaignName);
export default campaignRouter;
