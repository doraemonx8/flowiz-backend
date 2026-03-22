import {Router} from "express";
import {connectMeta,disconnectMeta} from "../controllers/metaController";

import verifyJWT from "../authMiddleware";
import checkQuota from "../middleware/quotaMiddleware";

const metaRouter=Router();

metaRouter.post('/connect',verifyJWT, checkQuota("whatsapp_agents"),connectMeta);
metaRouter.post('/disconnect',verifyJWT,disconnectMeta);


export default metaRouter;
