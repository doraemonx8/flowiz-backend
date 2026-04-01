import { Router } from "express";
import verifyJWT from "../authMiddleware";
import { getAllEmails, saveEmail, deleteEmail, encryptPassword, testInboxQueue, createEmail, deleteData, getList, getPrefill, updateStatus } from "../controllers/emailController";
import { checkQuota } from "../middleware/quotaMiddleware";
  
const emailRouter=Router();

emailRouter.get("/",verifyJWT,getAllEmails);
emailRouter.post("/",verifyJWT, checkQuota('email_accounts'),saveEmail);
emailRouter.delete("/",verifyJWT,deleteEmail);
emailRouter.post("/encrypt-password",encryptPassword);
// Quick IMAP flow check via BullMQ inbox queue (requires valid JWT)
emailRouter.post("/test-inbox-queue", verifyJWT, testInboxQueue);

emailRouter.post('/createEmail', verifyJWT, checkQuota('email_accounts'), createEmail);
emailRouter.delete('/removeData', verifyJWT, deleteData);
emailRouter.get('/emailList', verifyJWT, getList);
emailRouter.get('/prefill',verifyJWT,  getPrefill);
emailRouter.put('/statusUpdate',verifyJWT, updateStatus);

export default emailRouter;