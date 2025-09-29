import {chatEvent,testEvent,webEvent} from "../controllers/eventController";

import { Router } from "express";

const eventRouter=Router();

eventRouter.get('/chats',chatEvent);
eventRouter.post('/test',testEvent);
eventRouter.get('/web',webEvent);

export default eventRouter;
