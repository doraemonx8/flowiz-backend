import { getChats,createChat,getMessagesByChat,agentHandover } from "../controllers/chatController";

import { Router } from "express";

import verifyJWT from "../authMiddleware";

const chatRouter=Router();


chatRouter.get('/',verifyJWT,getChats);
chatRouter.post('/new',verifyJWT,createChat);
chatRouter.post('/messages',verifyJWT,getMessagesByChat);
chatRouter.post('/agent-handover',verifyJWT,agentHandover);
// router.post('/add',addFAQ);

export default chatRouter;
