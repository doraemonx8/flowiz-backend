import { Router } from "express";
import verifyJWT from "../authMiddleware";
import { getAllEmails, saveEmail, deleteEmail, encryptPassword, testInboxQueue, createEmail, deleteData, getList, getPrefill, updateStatus, uploadEmailAttachment } from "../controllers/emailController";
import { checkQuota } from "../middleware/quotaMiddleware";
import path from "path";
import crypto from "crypto";
import multer from 'multer';
const emailRouter=Router();

const storage = multer.diskStorage({
  destination: path.resolve(__dirname, '../../uploads/email'),
  filename: (req, file, cb) => {
    const randomName = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${randomName}${ext}`);
  }
});
const upload = multer({ storage: storage });

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
emailRouter.post("/upload-attachment", verifyJWT, upload.array('files', 10), uploadEmailAttachment);

export default emailRouter;