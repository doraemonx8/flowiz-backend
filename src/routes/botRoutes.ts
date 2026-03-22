import {sendBotMessage,testGraph} from "../controllers/botController";
import { Router } from "express";

import { checkQuota } from "../middleware/quotaMiddleware";

const botRouter=Router();

botRouter.post('/web',sendBotMessage);
botRouter.post("/test",testGraph);



export default botRouter;
