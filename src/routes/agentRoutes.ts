import { sendMessage,agentHandover } from "../controllers/agentController";
import { Router } from "express";

import verifyJWT from "../authMiddleware";

const agentRouter=Router();


agentRouter.post('/send-message',verifyJWT,sendMessage);
agentRouter.post('/update-handover',verifyJWT,agentHandover);


export default agentRouter;
