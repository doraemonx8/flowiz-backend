import {sendBotMessage,testCrawlEndpoint,testGraph} from "../controllers/botController";
import { Router } from "express";
import { promptLab } from "../controllers/botController";

import { checkQuota } from "../middleware/quotaMiddleware";
import { getLeadsFromGoogle, getMasterLeadsFromGoogle } from "../controllers/leadController";

const botRouter=Router();

botRouter.post('/web',sendBotMessage);
botRouter.post("/test",testGraph);

botRouter.post("/prompt-lab", promptLab);
botRouter.get("/test-crawl", testCrawlEndpoint);
botRouter.post("/test-get-leads", getLeadsFromGoogle);
botRouter.post("/test-get-master-leads", getMasterLeadsFromGoogle);


export default botRouter;
