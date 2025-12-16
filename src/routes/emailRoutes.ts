import { Router } from "express";
import verifyJWT from "../authMiddleware";
import { getAllEmails, saveEmail, deleteEmail, encryptPassword, testInboxQueue } from "../controllers/emailController";
import checkEmailAddLimit from "../middleware/checkEmailAddLimit";


const emailRouter=Router();

emailRouter.get("/",verifyJWT,getAllEmails);
emailRouter.post("/",verifyJWT,checkEmailAddLimit,saveEmail);
emailRouter.delete("/",verifyJWT,deleteEmail);
emailRouter.post("/encrypt-password",encryptPassword);
// Quick IMAP flow check via BullMQ inbox queue (requires valid JWT)
emailRouter.post("/test-inbox-queue", verifyJWT, testInboxQueue);


export default emailRouter;