import { Request, Response } from "express";

import {
  setRecords,
  deleteRecord,
  commonRecord,
  getRecordById,
  getAudienceByLeads,
} from "../models/commonModel";

import QuotaEngine from '../utils/quotaEngine';

const createAudience = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.sub;

    const data = req.body;
    data.userId = userId;

    const result = await setRecords("audience", {
      edit: 0,
      ...data,
    });

    await QuotaEngine.deductUsage({userId: userId,featureSlug: 'audience',amount: 1,source: 'consumption',description: `Audience created`});
    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error creating audience:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during adding Data",
      error: error.message,
    });
  }
};

const removeAudience = async (req: Request, res: Response) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Audience ID is required",
      });
    }

    const result = await deleteRecord("audience", id);
    return res.status(200).json({
      success: result,
    });
  } catch (error: any) {
    console.error("Error deleting audience:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during deleting audience",
      error: error.message,
    });
  }
};

const getAudienceList = async (req: Request, res: Response) => {
  try {
    const result = await commonRecord("audience");
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching audience list:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during fetching",
      error: error.message,
    });
  }
};

const getAudiencePrefill = async (req: Request, res: Response) => {
  try {
    const id = Number(req.query.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid audience ID",
      });
    }

    const result = await getRecordById("audience", id);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching audience prefill:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during fetching prefill",
      error: error.message,
    });
  }
};

const getAudienceByLeadsHandler = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.sub;

    const result = await getAudienceByLeads(userId);

    return res.status(200).json({
      result,
    });
  } catch (error: any) {
    console.error("Error fetching audience by leads:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during fetching",
      error: error.message,
    });
  }
};

export {
  createAudience,
  removeAudience,
  getAudienceList,
  getAudiencePrefill,
  getAudienceByLeadsHandler,
};
