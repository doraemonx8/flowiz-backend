import { Router } from "express";
import { getTemplates,sendTemplates,sendTemplateMessage,getMetaApprovedTemplates,uploadTemplateFile } from "../controllers/templateController";

import verifyJWT from "../authMiddleware";

import multer from "multer";
import path from "path";
import crypto from "crypto";

const templateRouter = Router();


const storage = multer.diskStorage({
  destination: path.resolve(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const randomName = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${randomName}${ext}`);
  }
});

const upload = multer({ storage });

templateRouter.get('/', verifyJWT, getTemplates);
templateRouter.post('/',verifyJWT, sendTemplates);
templateRouter.post('/send-template-message',verifyJWT,sendTemplateMessage);
templateRouter.get('/meta',verifyJWT,getMetaApprovedTemplates);
templateRouter.post('/upload',verifyJWT,upload.single('templateFile'),uploadTemplateFile);

export default templateRouter;
