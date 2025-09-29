import {Router} from "express";
import {connectMeta,disconnectMeta} from "../controllers/metaController";

import verifyJWT from "../authMiddleware";

const metaRouter=Router();

metaRouter.post('/connect',verifyJWT,connectMeta);
metaRouter.post('/disconnect',verifyJWT,disconnectMeta);


export default metaRouter;
