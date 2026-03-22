import { Router } from "express";

import verifyJWT from "../authMiddleware";
import { sendOtp,verifyOtp,logout,googleAuth  } from "../controllers/AuthController"; 

const authRouter=Router();

authRouter.post('/sentOtp',sendOtp);
authRouter.post('/verifyOtp',verifyOtp);
authRouter.post('/logout',verifyJWT,logout);
authRouter.post('/google',googleAuth);

export default authRouter;

