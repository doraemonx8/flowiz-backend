import { Router } from "express";
import { connectGoogle,getAuthURL,googleWebhook } from "../controllers/googleController";
import verifyJWT from "../authMiddleware";

const googleRouter= Router();

googleRouter.get("/auth-url",verifyJWT,getAuthURL);
googleRouter.get('/connect',connectGoogle);
googleRouter.post("/webhook",googleWebhook);


export default googleRouter;
