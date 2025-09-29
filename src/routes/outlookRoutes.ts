import { Router } from "express";
import { getAuthURL,connectOutlook } from "../controllers/outlookController";

import verifyJWT from "../authMiddleware";

const outlookRouter= Router();

outlookRouter.get("/auth-url",verifyJWT,getAuthURL);
outlookRouter.get('/connect',connectOutlook);


export default outlookRouter;
