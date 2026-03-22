import { Router } from "express";

import verifyJWT from "../authMiddleware";
import { createSubscriptions, cancelSubscription, manageSubscription } from "../controllers/lemonSqueezyController"; 

const lemonSqueezyRouter=Router();

lemonSqueezyRouter.post('/createSubscription',verifyJWT,createSubscriptions);
lemonSqueezyRouter.post('/cancelSubscription',verifyJWT,cancelSubscription);
lemonSqueezyRouter.get('/manageSubscription',verifyJWT,manageSubscription);


export default lemonSqueezyRouter;

