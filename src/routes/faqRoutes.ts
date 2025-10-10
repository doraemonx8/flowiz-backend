// import {processDoc,addFAQ} from "@controllers/faqController";
import { addFAQByDoc , addFaq,getAllFaq,deleteFAQ,deleteFAQByDoc} from "../controllers/faqController";

import { Router } from "express";
import path from "path";
import crypto from "crypto";

import verifyJWT from "../authMiddleware";
import checkFaqAddLimit from "../middleware/checkFaqAddLimit";
const faqRouter=Router();

import multer from 'multer';

const storage = multer.diskStorage({
  destination: path.resolve(__dirname, '../../uploads/faq'),
  filename: (req, file, cb) => {
    const randomName = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${randomName}${ext}`);
  }
});
const upload = multer({ storage: storage });


faqRouter.post('/add-doc',upload.single('doc'),verifyJWT,checkFaqAddLimit,addFAQByDoc);
faqRouter.delete("/doc",verifyJWT,deleteFAQByDoc)
faqRouter.post('/',verifyJWT,checkFaqAddLimit,addFaq);
faqRouter.get('/',verifyJWT,getAllFaq);
faqRouter.delete('/',verifyJWT,deleteFAQ);
// router.post('/add',addFAQ);

export default faqRouter;
