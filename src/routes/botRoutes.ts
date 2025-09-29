import {sendBotMessage,testGraph} from "../controllers/botController";
import { Router } from "express";
import checkWebMessageLimit from "../middleware/checkWebMessageLimit";
const botRouter=Router();


botRouter.post('/web',checkWebMessageLimit,sendBotMessage);
botRouter.post("/test",checkWebMessageLimit,testGraph);



export default botRouter;
