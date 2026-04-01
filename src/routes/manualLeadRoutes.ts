import { Router } from "express";
import verifyJWT from "../authMiddleware"; // Adjust path as necessary
import { 
  createLead, 
  deleteData, 
  getList, 
  getPrefill, 
  getAudienceList, 
  leadByAudience, 
  removeAudienceLead 
} from "../controllers/manualLeadController";
import checkQuota from "../middleware/quotaMiddleware";

const manualLeadRouter = Router();

manualLeadRouter.post('/createLeads', verifyJWT, checkQuota('leads'), createLead);
manualLeadRouter.delete('/removeData', verifyJWT, deleteData);
manualLeadRouter.get('/leadsList', verifyJWT, getList);
manualLeadRouter.get('/prefill', verifyJWT, getPrefill);
manualLeadRouter.get('/leadAudience', verifyJWT, getAudienceList);
manualLeadRouter.get('/leadByAudience', verifyJWT, leadByAudience);
manualLeadRouter.get('/removeAudienceLead', verifyJWT, removeAudienceLead);

export default manualLeadRouter;