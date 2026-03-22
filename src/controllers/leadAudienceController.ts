import { Request, Response } from "express";

import {
  setRecords,
  deleteRecord,
  commonRecord,
  getRecordById,
  getLeadsWithAudience,
  getLeadsData,
  removeAudienceInLead,
} from "../models/commonModel";

import QuotaEngine from '../utils/quotaEngine';

/* ======================================================
   CREATE LEAD
====================================================== */
export const createLead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.sub;

    const data = req.body;
    data.userId = userId;

    const result = await setRecords("leads", {
      edit: 0,
      ...data,
    });
    await QuotaEngine.deductUsage({userId,featureSlug: 'leads',amount: 1,source: 'consumption',description: `Lead created`});
    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error creating lead:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during adding Data",
      error: error.message,
    });
  }
};

/* ======================================================
   DELETE LEAD
====================================================== */
export const removeLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Lead ID is required",
      });
    }

    const result = await deleteRecord("leads", id);

    return res.status(200).json({
      success: result,
    });
  } catch (error: any) {
    console.error("Error deleting lead:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during deleting lead",
      error: error.message,
    });
  }
};

/* ======================================================
   LEADS LIST
====================================================== */
export const getLeadsList = async (_req: Request, res: Response) => {
  try {
    const result = await commonRecord("leads");
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching leads list:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during fetching",
      error: error.message,
    });
  }
};

/* ======================================================
   PREFILL LEAD
====================================================== */
export const getLeadPrefill = async (req: Request, res: Response) => {
  try {
    const id = Number(req.query.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Invalid lead ID",
      });
    }

    const result = await getRecordById("leads", id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching lead prefill:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during fetching prefill",
      error: error.message,
    });
  }
};

/* ======================================================
   LEADS WITH AUDIENCE
====================================================== */
export const getLeadsWithAudienceHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const user = (req as any).user;
    const userId = user.sub;

    const result = await getLeadsWithAudience(userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching leads with audience:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during fetching",
      error: error.message,
    });
  }
};

/* ======================================================
   LEADS BY AUDIENCE
====================================================== */
export const getLeadsByAudience = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.sub;
    const audienceId = req.query.audienceId;

    const result = await getLeadsData(userId, Number(audienceId));

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching leads by audience:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during fetching",
      error: error.message,
    });
  }
};

/* ======================================================
   REMOVE AUDIENCE FROM LEAD
====================================================== */
export const removeAudienceFromLead = async (req: Request, res: Response) => {
  try {
    const id = Number(req.query.id);
    const audienceId = req.query.audienceId as string;

    if (!id || !audienceId) {
      return res.status(400).json({
        success: false,
        message: "Lead ID and Audience ID are required",
      });
    }

    const result = await removeAudienceInLead(id, audienceId);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Error removing audience from lead:", error.message);
    return res.status(500).json({
      success: false,
      message: "Error during fetching",
      error: error.message,
    });
  }
};
