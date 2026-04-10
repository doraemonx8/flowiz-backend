import { Request, Response } from "express";
import * as CommonService from "../services/commonService";
import QuotaEngine from "../utils/quotaEngine";

export const createLead = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    // Assuming your verifyJWT middleware attaches the user payload to req.user
    const user = (req as any).user;
    // data.userId = user?.sub || user?.id;
    delete data.userId;
    console.log(data, "ol");

    // We pass 'leads' as the table name based on the updated commonService
    const result = await CommonService.create(data, 'leads');
    await QuotaEngine.deductUsage({userId: user.sub,featureSlug: 'leads',amount: 1,source: 'consumption',description: `Lead Added`});
    return res.status(201).json(result);
  } catch (error: any) {
    console.error("Error during adding Data:", error.message);
    return res.status(500).json({ success: false, message: "Error during adding Data", error: error.message });
  }
};

export const deleteData = async (req: Request, res: Response) => {
  try {
    const id = req.body.id;
    console.log("id", id);
    
    const result = await CommonService.deleteRecord(id, 'leads');
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error during deleting Data:", error.message);
    return res.status(500).json({ success: false, message: "Error during deleting users", error: error.message });
  }
};

export const getList = async (req: Request, res: Response) => {
  try {
    // We use listRecord from the new common service which maps to commonRecord
    const result = await CommonService.listRecord('leads');
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error during fetching:", error.message);
    return res.status(500).json({ success: false, message: "Error during fetching", error: error.message });
  }
};

export const getPrefill = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.query.id as string);
    const result = await CommonService.getRecordById(id, 'leads');
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error during fetching:", error.message);
    return res.status(500).json({ success: false, message: "Error during fetching prefill", error: error.message });
  }
};

export const getAudienceList = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user?.sub || user?.id;

    const result = await CommonService.getLeadsWithAudience(userId);
    // commonService's getLeadsWithAudience already returns the array, so we wrap it in a success response
    return res.status(200).json({ success: true, data: result }); 
  } catch (error: any) {
    console.error("Error during fetching:", error.message);
    return res.status(500).json({ success: false, message: "Error during fetching", error: error.message });
  }
};

export const leadByAudience = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user?.sub || user?.id;
    const audienceId = req.query.audienceId as string;

    const result = await CommonService.getLeadsData(userId, audienceId);
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error during fetching:", error.message);
    return res.status(500).json({ success: false, message: "Error during fetching", error: error.message });
  }
};

export const removeAudienceLead = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.query.id as string);
    const audienceId = req.query.audienceId as string;

    const result = await CommonService.removeAudienceInLead(id, audienceId);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error during fetching:", error.message);
    return res.status(500).json({ success: false, message: "Error during fetching prefill", error: error.message });
  }
};