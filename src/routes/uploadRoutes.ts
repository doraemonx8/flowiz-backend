import { Router } from "express";
import { singleUpload, bulkUpload } from "../controllers/uploadController";
import { upload } from "../middleware/multerConfig";
import verifyJWT from "../authMiddleware";
import checkQuota from "../middleware/quotaMiddleware";

const uploadRouter = Router();


uploadRouter.post('/upload', verifyJWT, upload.single('file'), checkQuota('leads'), singleUpload);
uploadRouter.post('/bulkUpload', verifyJWT, upload.single('file'), checkQuota('leads'), bulkUpload);

export default uploadRouter;