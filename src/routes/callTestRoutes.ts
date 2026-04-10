/**
 * callTestRoutes.ts  —  DROP THIS FILE AFTER TESTING
 *
 * Mount in src/index.ts (dev only):
 *   import callTestRouter from "./routes/callTestRoutes";
 *   app.use("/api/test/calls", callTestRouter);
 */

import { Router, Request, Response } from "express";
import axios from "axios";
import { callQueue } from "../queues/campaignQueue";
import { addJob } from "../models/jobModel";
import { createChat } from "../models/chats";
import { saveSubFlowToDB, getSubFlowDataFromDB } from "../models/flowModel";
import { getCampaignIdBySlug } from "../models/campaignModel";
import { generateCalls } from "../utils/flowPrompt";
import { jsonrepair } from "jsonrepair";
import { createCallJobsDataFromFlow, LeadData } from "../utils/channelWorkerUtil";
import { callEndedWebhook } from "../controllers/callEndedController";
import Chat from "../models/schema";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// 1. GENERATE call flow JSON from a product description (no DB save)
// POST /api/test/calls/generate
// ─────────────────────────────────────────────────────────────────────────────
router.post("/generate", async (req: Request, res: Response): Promise<any> => {
  try {
    const { productJson } = req.body;
    if (!productJson) {
      return res.status(400).json({ status: false, message: "productJson is required" });
    }

    const raw  = await generateCalls(
      typeof productJson === "string" ? productJson : JSON.stringify(productJson)
    );
    const data = JSON.parse(jsonrepair(raw));

    return res.json({ status: true, nodeCount: data.length, data });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GENERATE + SAVE call flow for a campaign slug
// POST /api/test/calls/generate-and-save
// ─────────────────────────────────────────────────────────────────────────────
router.post("/generate-and-save", async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, slug, productJson } = req.body;
    if (!userId || !slug || !productJson) {
      return res.status(400).json({ status: false, message: "userId, slug, productJson required" });
    }

    const campaigns  = await getCampaignIdBySlug(slug, userId);
    const campaignId = campaigns?.[0]?.id;
    if (!campaignId) {
      return res.status(404).json({ status: false, message: "Campaign not found for slug" });
    }

    const raw  = await generateCalls(
      typeof productJson === "string" ? productJson : JSON.stringify(productJson)
    );
    const data = JSON.parse(jsonrepair(raw));

    await saveSubFlowToDB(JSON.stringify(data), slug, "3", userId, campaignId);

    return res.json({
      status: true,
      message: "Call flow generated and saved",
      campaignId,
      nodeCount: data.length,
      data,
    });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FETCH saved call flow from DB
// GET /api/test/calls/flow?slug=xxx&userId=yyy
// ─────────────────────────────────────────────────────────────────────────────
router.get("/flow", async (req: Request, res: Response): Promise<any> => {
  try {
    const { slug, userId } = req.query as { slug: string; userId: string };
    if (!slug || !userId) {
      return res.status(400).json({ status: false, message: "slug and userId required" });
    }

    const rows = await getSubFlowDataFromDB(slug, "3", userId);
    if (!rows.length) {
      return res.status(404).json({ status: false, message: "No call subflow found" });
    }

    const raw  = rows[0].json || rows[0].flowData;
    const data = raw ? JSON.parse(raw) : null;

    return res.json({ status: true, data });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESOLVE placeholders — preview what the script looks like for a lead
// POST /api/test/calls/resolve
// ─────────────────────────────────────────────────────────────────────────────
router.post("/resolve", async (req: Request, res: Response): Promise<any> => {
  try {
    const { flowJson, lead } = req.body;
    // flowJson: the raw array from step 1/2
    // lead:     { id, name, email, phone }
    if (!flowJson || !lead) {
      return res.status(400).json({ status: false, message: "flowJson and lead required" });
    }

    const subFlow  = { json: Array.isArray(flowJson) ? flowJson : JSON.parse(flowJson), flowData: null };
    const leadData = lead as LeadData;
    const jobs     = createCallJobsDataFromFlow(subFlow, leadData);

    return res.json({ status: true, resolvedJobs: jobs });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. DIRECT call to Python server (no BullMQ, no campaign)
// POST /api/test/calls/make-direct
// ─────────────────────────────────────────────────────────────────────────────
router.post("/make-direct", async (req: Request, res: Response): Promise<any> => {
  try {
    const { phone, script, calltype } = req.body;
    if (!phone || !script) {
      return res.status(400).json({ status: false, message: "phone and script required" });
    }

    const CALL_SERVER_URL = process.env.CALL_SERVER_URL || "https://4fbb-122-161-52-81.ngrok-free.app";
    const CALL_TYPE       = calltype || process.env.CALL_TYPE || "campaign";

    const response = await axios.post(
      `${CALL_SERVER_URL}/make-call`,
      {
        ...req.body,              
        number: phone,           
        calltype: CALL_TYPE
      },
      { timeout: 15000 }
    );

    return res.json({ status: true, pythonResponse: response.data });
  } catch (err: any) {
    const detail = err?.response?.data ?? err.message;
    return res.status(500).json({ status: false, message: "Python call server error", detail });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ENQUEUE a call job manually (simulates what campaignWorker does)
// POST /api/test/calls/enqueue
// ─────────────────────────────────────────────────────────────────────────────
router.post("/enqueue", async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      phone, name, email,
      script, title, nodeId,
      leadId, userId, campaignId, companyId, flowId,
      delayMs,
    } = req.body;

    if (!phone || !script || !leadId || !userId || !campaignId || !companyId || !flowId) {
      return res.status(400).json({
        status: false,
        message: "phone, script, leadId, userId, campaignId, companyId, flowId required",
      });
    }

    const jobId = `test_${Date.now()}_call_${leadId}`;
    await callQueue.add(
      "call-job",
      {
        subFlow: null,
        leadId, email, phone, name,
        campaignId, companyId, userId, flowId,
        nodeId:  nodeId  || "call1",
        script,
        title:   title   || "Test Call",
      },
      { jobId, delay: delayMs || 0 }
    );
    await addJob(jobId, companyId, userId, flowId, campaignId, String(leadId), "call");

    return res.json({ status: true, message: "Call job enqueued", jobId });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. FULL pipeline — generate → resolve → enqueue (one shot)
// POST /api/test/calls/full-pipeline
// ─────────────────────────────────────────────────────────────────────────────
router.post("/full-pipeline", async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      userId, slug, productJson,
      lead,                // { id, name, email, phone }
      campaignId, companyId,
    } = req.body;

    if (!userId || !slug || !productJson || !lead || !campaignId || !companyId) {
      return res.status(400).json({
        status: false,
        message: "userId, slug, productJson, lead, campaignId, companyId required",
      });
    }

    // a) Generate
    const raw   = await generateCalls(
      typeof productJson === "string" ? productJson : JSON.stringify(productJson)
    );
    const nodes = JSON.parse(jsonrepair(raw));

    // b) Save
    await saveSubFlowToDB(JSON.stringify(nodes), slug, "3", userId, campaignId);

    // c) Resolve placeholders
    const subFlow  = { json: nodes, flowData: null };
    const leadData = lead as LeadData;
    const jobs     = createCallJobsDataFromFlow(subFlow, leadData);

    if (!jobs.length) {
      return res.status(400).json({ status: false, message: "No call jobs generated from flow" });
    }

    // d) Enqueue
    const enqueuedJobs: any[] = [];
    for (const [i, callJob] of jobs.entries()) {
      const delayInMs = i === 0
        ? 0
        : callJob.delay
          ? Number(callJob.delay.hours) * 3_600_000 + Number(callJob.delay.mins) * 60_000
          : 0;

      const jobId = `pipeline_${Date.now()}_call${i}_${lead.id}`;
      await callQueue.add(
        "call-job",
        {
          subFlow,
          leadId:    lead.id,
          email:     lead.email,
          phone:     lead.phone,
          name:      lead.name,
          campaignId, companyId, userId,
          flowId:    `pipeline_test`,
          nodeId:    callJob.id,
          script:    callJob.script,
          title:     callJob.title,
        },
        { jobId, delay: delayInMs }
      );
      await addJob(jobId, companyId, userId, "pipeline_test", campaignId, String(lead.id), "call");
      enqueuedJobs.push({ jobId, nodeId: callJob.id, title: callJob.title, delayMs: delayInMs });
    }

    return res.json({
      status: true,
      message: "Pipeline complete: generated → saved → enqueued",
      generatedNodes: nodes.length,
      enqueuedJobs,
      resolvedScriptPreview: jobs[0].script.slice(0, 200),
    });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SIMULATE call-ended callback from Python (test the webhook)
// POST /api/test/calls/simulate-ended
// ─────────────────────────────────────────────────────────────────────────────
router.post("/simulate-ended", callEndedWebhook);

// ─────────────────────────────────────────────────────────────────────────────
// 9. VIEW call chats (latest 10)
// GET /api/test/calls/chats?companyId=xxx
// ─────────────────────────────────────────────────────────────────────────────
router.get("/chats", async (req: Request, res: Response): Promise<any> => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ status: false, message: "companyId required" });
    }

    const chats = await Chat.find({ channel: "call", companyId })
      .sort({ createdOn: -1 })
      .limit(10)
      .lean();

    return res.json({ status: true, count: chats.length, chats });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. QUEUE stats — see pending / active / delayed call jobs
// GET /api/test/calls/queue-stats
// ─────────────────────────────────────────────────────────────────────────────
router.get("/queue-stats", async (_req: Request, res: Response): Promise<any> => {
  try {
    const [counts, waiting, delayed] = await Promise.all([
      callQueue.getJobCounts(),
      callQueue.getJobs(["waiting"], 0, 20),
      callQueue.getJobs(["delayed"], 0, 20),
    ]);

    return res.json({
      status: true,
      counts,
      waiting: waiting.map((j) => ({ id: j.id, data: j.data })),
      delayed: delayed.map((j) => ({ id: j.id, data: j.data, delay: j.opts?.delay })),
    });
  } catch (err: any) {
    return res.status(500).json({ status: false, message: err.message });
  }
});

export default router;