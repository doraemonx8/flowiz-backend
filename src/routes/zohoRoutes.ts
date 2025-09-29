import { Router } from "express";
import { getAuthURL,connectZoho } from "../controllers/zohoController";

import verifyJWT from "../authMiddleware";

const zohoRouter= Router();

zohoRouter.get("/auth-url",verifyJWT,getAuthURL);
zohoRouter.get('/connect',connectZoho);


export default zohoRouter;
