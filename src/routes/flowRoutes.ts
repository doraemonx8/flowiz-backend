import { Router } from "express";
import { createParentFlow,setWebConfig,getWebConfig,validateFlowPrompt,generateEmailByPrompt,getSubFlow,setFlowConfig,getFlowConfig,getEncryptedId, getFlowData,setFlowDescriptionData, saveSubFlow,setSubFlowConfig } from "../controllers/flowController";

import verifyJWT from "../authMiddleware";
import { checkQuota } from "../middleware/quotaMiddleware";


const flowRouter = Router();


flowRouter.post('/create-flow', verifyJWT, checkQuota('campaigns'), createParentFlow);
flowRouter.post('/set-config',verifyJWT, checkQuota('chatbot_agents'), setWebConfig);
flowRouter.get('/get-config',getWebConfig);
flowRouter.post('/check-prompt',verifyJWT, checkQuota('campaigns'),validateFlowPrompt);
flowRouter.post('/generate-emails',verifyJWT,generateEmailByPrompt);
flowRouter.get('/get-sub-flow',verifyJWT,getSubFlow);
flowRouter.post("/config",verifyJWT,setFlowConfig);
flowRouter.get("/config",verifyJWT,getFlowConfig);
flowRouter.get("/encrypt",getEncryptedId);
flowRouter.get("/",verifyJWT,getFlowData);
flowRouter.post('/business-details',verifyJWT,setFlowDescriptionData);
flowRouter.post('/sub-flow',verifyJWT,saveSubFlow);
flowRouter.post('/sub-flow/config',verifyJWT,setSubFlowConfig);


export default flowRouter;
