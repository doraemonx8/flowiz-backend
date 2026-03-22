// import {processDoc,addFAQ} from "@controllers/faqController";
import { addFAQByDoc , addFaq,getAllFaq,deleteFAQ,deleteFAQByDoc} from "../controllers/faqController";

import { Router } from "express";
import path from "path";
import crypto from "crypto";

import verifyJWT from "../authMiddleware";
import multer from 'multer';
import { checkQuota } from "../middleware/quotaMiddleware";

const faqRouter=Router();

const storage = multer.diskStorage({
  destination: path.resolve(__dirname, '../../uploads/faq'),
  filename: (req, file, cb) => {
    const randomName = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${randomName}${ext}`);
  }
});
const upload = multer({ storage: storage });


faqRouter.post('/add-doc',upload.single('doc'),verifyJWT, checkQuota('kb_file_length'), addFAQByDoc);
faqRouter.delete("/doc",verifyJWT,deleteFAQByDoc)
faqRouter.post('/',verifyJWT, checkQuota('kb_faq'), addFaq);
faqRouter.get('/',verifyJWT,getAllFaq);
faqRouter.delete('/',verifyJWT,deleteFAQ);
// router.post('/add',addFAQ);

export default faqRouter;
