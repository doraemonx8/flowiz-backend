/**
 * callController.ts  — complete file
 *
 * POST /api/calls/session-created   — Python links chatId ↔ sessionId
 * POST /api/calls/save-intents      — save_conversation_result → Chat.intents
 * POST /api/calls/save-summary      — save_conversation_summary → Chat.callSummary
 * POST /api/calls/call-ended        — call finished + optional analysisResult
 * GET  /api/calls/chat              — lookup chat by callTaskId (internal)
 * GET  /api/calls/analysis          — FRONTEND: full analysis for a call
 */

import { Request, Response } from "express";
import Chat from "../models/schema";
import { sendMessageToAgent } from "../utils/eventManager";
import db from "../models/conn";
import { QueryTypes } from "sequelize";

// ─── 1. Session Created ───────────────────────────────────────────────────────
export const sessionCreated = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId, sessionId, callSid } = req.body;
    if (!chatId || !sessionId) {
      return res.status(400).json({ status: false, message: "chatId and sessionId required" });
    }
    await Chat.findByIdAndUpdate(chatId, { callSessionId: sessionId, callSid: callSid ?? null });
    return res.status(200).json({ status: true });
  } catch (err) {
    console.error("[sessionCreated]", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// ─── 2. Save Intents ─────────────────────────────────────────────────────────
export const saveCallIntents = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId, intents } = req.body;
    if (!chatId || !intents) {
      return res.status(400).json({ status: false, message: "chatId and intents required" });
    }

    // Merge with existing intents — tool can fire multiple times
    const existing = await Chat.findById(chatId).select("intents companyId");
    if (!existing) return res.status(404).json({ status: false, message: "Chat not found" });

    const merged = { ...(existing.intents as any ?? {}), ...intents };

    await Chat.findByIdAndUpdate(chatId, { $set: { intents: merged } });

    // Real-time SSE push — same pattern as web/whatsapp bots
    sendMessageToAgent(existing.companyId, {
      type: "chatUpdated",
      chatData: { intents: merged, sentiment: "proceed" },
      chatId,
    });

    return res.status(200).json({ status: true });
  } catch (err) {
    console.error("[saveCallIntents]", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// ─── 3. Save Summary ─────────────────────────────────────────────────────────
export const saveCallSummary = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId, summary } = req.body;
    if (!chatId || !summary) {
      return res.status(400).json({ status: false, message: "chatId and summary required" });
    }

    const summaryMessage = {
      isBot: false,
      isAgent: false,
      message: `📋 Call Summary:\n${summary}`,
      createdOn: Math.floor(Date.now() / 1000),
      flowNodeId: "call_summary",
    };

    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { $push: { messages: summaryMessage }, $set: { callSummary: summary } },
      { new: true }
    );

    if (!chat) return res.status(404).json({ status: false, message: "Chat not found" });

    sendMessageToAgent(chat.companyId, {
      type: "messageAdded",
      chatId,
      message: { ...summaryMessage, createdOn: new Date().getTime(), isSeen: false },
    });

    return res.status(200).json({ status: true });
  } catch (err) {
    console.error("[saveCallSummary]", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// ─── 4. Call Ended ────────────────────────────────────────────────────────────
// Python calls this TWICE:
//   a) Immediately when call ends (no analysisResult) — updates status/duration
//   b) After audio pipeline finishes (with full analysisResult) — updates intents/summary
export const callEnded = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId, callTaskId, callId, duration, status, transcript, recordingUrl, analysisResult } = req.body;

    const query = chatId ? { _id: chatId } : { callTaskId };
    const chat = await Chat.findOne(query);

    if (!chat) {
      console.warn("[callEnded] No chat found for", query);
      return res.status(200).json({ status: true, message: "No matching chat" });
    }

    const isAnalysisCall = Boolean(analysisResult);

    // ── Status message for chat timeline ────────────────────────────────
    const summaryLines: string[] = [
      `📞 Call ${isAnalysisCall ? "analysis complete" : "ended"} — status: ${status ?? "unknown"}`,
      duration != null ? `⏱ Duration: ${duration}s` : "",
      recordingUrl ? `🎙 Recording: ${recordingUrl}` : "",
    ].filter(Boolean);

    if (transcript && !isAnalysisCall) summaryLines.push("📝 Transcript:", transcript);
    const summaryMessage = summaryLines.join("\n");

    // ── Build $set ───────────────────────────────────────────────────────
    const setPayload: Record<string, any> = {
      callId:       callId      ?? (chat as any).callId      ?? null,
      callDuration: duration    ?? (chat as any).callDuration ?? null,
      callStatus:   status      ?? null,
      recordingUrl: recordingUrl ?? (chat as any).recordingUrl ?? null,
      isCompleted:  status === "completed" || status === "answered",
    };

    if (isAnalysisCall) {
      const extraction       = analysisResult.extraction       ?? {};
      const capturedIntents  = analysisResult.captured_intents ?? {};
      const existingIntents  = (chat.intents as any)           ?? {};

      // Final intents = existing live-captured + audio-extracted
      // Audio extraction wins on conflict — it's the ground truth
      setPayload.intents    = { ...existingIntents, ...capturedIntents, ...extraction };
      if (analysisResult.summary) setPayload.callSummary = analysisResult.summary;
    }

    await Chat.findByIdAndUpdate(chat._id, {
      $push: {
        messages: {
          isBot: false,
          isAgent: false,
          flowNodeId: chat.currentFlowNodeId,
          message: summaryMessage,
          createdOn: Math.floor(Date.now() / 1000),
        },
      },
      $set: setPayload,
    });

    // ── MySQL calls table ────────────────────────────────────────────────
    try {
      await db.sequelize.query(
        `INSERT INTO calls (chatId, callId, leadId, campaignId, duration, status, recordingUrl, createdOn)
         VALUES (:chatId, :callId, :leadId, :campaignId, :duration, :callStatus, :recordingUrl, NOW())
         ON DUPLICATE KEY UPDATE
           callId = VALUES(callId), duration = VALUES(duration),
           status = VALUES(status), recordingUrl = VALUES(recordingUrl)`,
        {
          replacements: {
            chatId: String(chat._id),
            callId: callId ?? null,
            leadId: chat.userId ?? null,
            campaignId: chat.campaignId ?? null,
            duration: duration ?? 0,
            callStatus: status ?? "unknown",
            recordingUrl: recordingUrl ?? null,
          },
          type: QueryTypes.INSERT,
        }
      );
    } catch (sqlErr: any) {
      console.warn("[callEnded] MySQL insert skipped:", sqlErr.message);
    }

    // ── SSE push ─────────────────────────────────────────────────────────
    sendMessageToAgent(chat.companyId, {
      type: isAnalysisCall ? "callAnalysisReady" : "messageAdded",
      chatId: chat._id,
      message: { isBot: false, message: summaryMessage, createdOn: new Date().getTime(), isSeen: false },
      ...(isAnalysisCall ? { intents: setPayload.intents } : {}),
    });

    return res.status(200).json({ status: true });
  } catch (err) {
    console.error("[callEnded]", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// ─── 5. Get Call Chat (internal) ─────────────────────────────────────────────
export const getCallChat = async (req: Request, res: Response): Promise<any> => {
  try {
    const { callTaskId } = req.query;
    if (!callTaskId) return res.status(400).json({ status: false, message: "callTaskId required" });

    const chat = await Chat.findOne({ callTaskId: String(callTaskId) }).select(
      "_id campaignId userId adminId companyId flowId intents callSessionId"
    );
    if (!chat) return res.status(404).json({ status: false, message: "Not found" });
    return res.status(200).json({ status: true, data: chat });
  } catch (err) {
    console.error("[getCallChat]", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// ─── 6. Get Analysis — FRONTEND ENDPOINT ─────────────────────────────────────
/**
 * GET /api/calls/analysis?chatId=xxx
 *
 * Frontend uses this to display the post-call analysis panel.
 *
 * Response:
 * {
 *   status: true,
 *   data: {
 *     callStatus, callDuration, callSummary, recordingUrl, isCompleted,
 *     intents,           // merged final intents (audio + live)
 *     captured_intents,  // what was saved live during the call
 *     summaryMessages,   // array of summary/transcript message strings
 *     messages,          // full chat messages array
 *     chatId, campaignId, createdOn
 *   }
 * }
 */
export const getCallAnalysis = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId } = req.query;
    if (!chatId) return res.status(400).json({ status: false, message: "chatId is required" });

    const chat = await Chat.findById(String(chatId)).select(
      "_id callStatus callDuration callSummary recordingUrl intents messages " +
      "callSid isCompleted createdOn userId adminId campaignId"
    );

    if (!chat) return res.status(404).json({ status: false, message: "Call not found" });

    // Separate captured_intents from the merged intents object
    const allIntents: Record<string, any> = (chat.intents as any) ?? {};
    const capturedIntents = allIntents.captured_intents ?? {};
    const mergedIntents   = { ...allIntents };
    delete mergedIntents.captured_intents;

    // Pull summary messages from chat timeline
    const summaryMessages = chat.messages
      .filter((m: any) => m.flowNodeId === "call_summary" || m.flowNodeId === chat.currentFlowNodeId)
      .map((m: any) => m.message);

    return res.status(200).json({
      status: true,
      data: {
        callStatus:      (chat as any).callStatus,
        callDuration:    (chat as any).callDuration,
        callSummary:     (chat as any).callSummary,
        recordingUrl:    (chat as any).recordingUrl,
        isCompleted:     chat.isCompleted,
        intents:         mergedIntents,
        captured_intents: capturedIntents,
        summaryMessages,
        messages:        chat.messages,
        chatId:          chat._id,
        campaignId:      chat.campaignId,
        createdOn:       chat.createdOn,
      },
    });
  } catch (err) {
    console.error("[getCallAnalysis]", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};