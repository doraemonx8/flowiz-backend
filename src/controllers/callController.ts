/**
 * callController.ts
 * POST /api/calls/session-created   — Python links chatId ↔ sessionId
 * POST /api/calls/save-intents      — save_conversation_result → Chat.intents  (live calltypes only)
 * POST /api/calls/save-summary      — save_conversation_summary → Chat.callSummary (live calltypes only)
 * POST /api/calls/call-ended        — call finished + optional analysisResult (with dynamic intents)
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
    await Chat.findByIdAndUpdate(chatId, {
      callSessionId: sessionId,
      callSid: callSid ?? null,
    });
    return res.status(200).json({ status: true });
  } catch (err) {
    console.error("[sessionCreated]", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// ─── 2. Save Intents (live calltypes only) ───────────────────────────────────
export const saveCallIntents = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId, intents } = req.body;
    if (!chatId || !intents) {
      return res.status(400).json({ status: false, message: "chatId and intents required" });
    }

    const existing = await Chat.findById(chatId).select("intents companyId");
    if (!existing) return res.status(404).json({ status: false, message: "Chat not found" });

    const merged = { ...(existing.intents as any ?? {}), ...intents };
    await Chat.findByIdAndUpdate(chatId, { $set: { intents: merged } });

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

// ─── 3. Save Summary (live calltypes only) ───────────────────────────────────
export const saveCallSummary = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId, summary } = req.body;
    if (!chatId || !summary) {
      return res.status(400).json({ status: false, message: "chatId and summary required" });
    }

    const summaryMessage = {
      isBot: false,
      isAgent: false,
      message: `Call Summary:\n${summary}`,
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
/**
 * Python calls this TWICE:
 *   a) Immediately when the call ends — updates status/duration/recordingUrl.
 *      `analysisResult` is absent.
 *
 *   b) After the audio pipeline finishes (5+ min later) — carries the full
 *      `analysisResult` including extracted dynamic intents.
 *
 * On the second call the handler:
 *   - Merges dynamic intents (from `analysisResult.intents`) into Chat.intents
 *   - Saves the summary and transcription
 *   - Pushes an SSE event so the dashboard updates in real time
 */
export const callEnded = async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      chatId,
      callTaskId,
      callId,
      duration,
      status,
      transcript,
      recordingUrl,
      analysisResult,
    } = req.body;

    // ── Find the chat ─────────────────────────────────────────────────────────
    const query: any = chatId ? { _id: chatId } : { callTaskId };
    const chat = await Chat.findOne(query);

    if (!chat) {
      // Not an error — the chat may have been created moments later
      console.warn("[callEnded] No chat found for", query);
      return res.status(200).json({ status: true, message: "No matching chat" });
    }

    const isAnalysisCall = Boolean(analysisResult);

    // ── Timeline message ──────────────────────────────────────────────────────
    const summaryLines: string[] = [
      `📞 Call ${isAnalysisCall ? "analysis complete" : "ended"} — status: ${status ?? "unknown"}`,
      duration != null ? `⏱ Duration: ${duration}s` : "",
      recordingUrl ? `🎙 Recording: ${recordingUrl}` : "",
    ].filter(Boolean);

    if (transcript && !isAnalysisCall) summaryLines.push("📝 Transcript:", transcript);
    const summaryMessage = summaryLines.join("\n");

    // ── Build $set payload ────────────────────────────────────────────────────
    const setPayload: Record<string, any> = {
      callId:       callId       ?? (chat as any).callId       ?? null,
      callDuration: duration     ?? (chat as any).callDuration  ?? null,
      callStatus:   status       ?? null,
      recordingUrl: recordingUrl ?? (chat as any).recordingUrl  ?? null,
      isCompleted:  status === "completed" || status === "answered",
    };

    if (isAnalysisCall) {
      /**
       * analysisResult shape (from Python tasks.py notify_flowiz_analysis):
       * {
       *   summary:          string,
       *   transcription:    [...],
       *   extraction:       { customer_intent, issues_discussed, ... },  ← standard fields
       *   captured_intents: { intent_name: value, ... },                 ← dynamic fields
       * }
       *
       * We merge all of them into Chat.intents so the frontend has one place to
       * look regardless of calltype.
       */
      const extraction      = analysisResult.extraction       ?? {};
      const dynamicIntents  = analysisResult.captured_intents ?? {};  // from _build_dynamic_analysis_prompt → "intents" key
      const existingIntents = (chat.intents as any)           ?? {};

      // Priority: dynamic intents > audio extraction > existing live-captured intents
      setPayload.intents = {
        ...existingIntents,
        ...extraction,
        ...dynamicIntents,
      };

      if (analysisResult.summary) {
        setPayload.callSummary = analysisResult.summary;
      }

      // Store raw transcription array for the analysis panel
      if (analysisResult.transcription?.length) {
        setPayload.transcription = JSON.stringify(analysisResult.transcription);
      }
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    await Chat.findByIdAndUpdate(chat._id, {
      $push: {
        messages: {
          isBot:      false,
          isAgent:    false,
          flowNodeId: chat.currentFlowNodeId,
          message:    summaryMessage,
          createdOn:  Math.floor(Date.now() / 1000),
        },
      },
      $set: setPayload,
    });

    // ── MySQL calls table ─────────────────────────────────────────────────────
    try {
      await db.sequelize.query(
        `INSERT INTO calls (chatId, callId, leadId, campaignId, duration, status, recordingUrl, createdOn)
         VALUES (:chatId, :callId, :leadId, :campaignId, :duration, :callStatus, :recordingUrl, NOW())
         ON DUPLICATE KEY UPDATE
           callId       = VALUES(callId),
           duration     = VALUES(duration),
           status       = VALUES(status),
           recordingUrl = VALUES(recordingUrl)`,
        {
          replacements: {
            chatId:       String(chat._id),
            callId:       callId       ?? null,
            leadId:       chat.userId  ?? null,
            campaignId:   chat.campaignId ?? null,
            duration:     duration     ?? 0,
            callStatus:   status       ?? "unknown",
            recordingUrl: recordingUrl ?? null,
          },
          type: QueryTypes.INSERT,
        }
      );
    } catch (sqlErr: any) {
      console.warn("[callEnded] MySQL insert skipped:", sqlErr.message);
    }

    // ── SSE push ──────────────────────────────────────────────────────────────
    sendMessageToAgent(chat.companyId, {
      type: isAnalysisCall ? "callAnalysisReady" : "messageAdded",
      chatId: chat._id,
      message: {
        isBot:     false,
        message:   summaryMessage,
        createdOn: new Date().getTime(),
        isSeen:    false,
      },
      ...(isAnalysisCall
        ? {
            intents:         setPayload.intents,
            dynamicIntents:  analysisResult?.captured_intents ?? {},
            summary:         analysisResult?.summary ?? "",
          }
        : {}),
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
    if (!callTaskId) {
      return res.status(400).json({ status: false, message: "callTaskId required" });
    }

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
 * Returns everything the frontend needs to render the post-call analysis panel:
 *   - Standard call metadata (status, duration, recording URL)
 *   - Merged intents (dynamic + standard extraction)
 *   - Separated dynamic_intents for the "Captured Fields" section
 *   - Full messages + summary messages for the timeline
 */
export const getCallAnalysis = async (req: Request, res: Response): Promise<any> => {
  try {
    const { chatId } = req.query;
    if (!chatId) {
      return res.status(400).json({ status: false, message: "chatId is required" });
    }

    const chat = await Chat.findById(String(chatId)).select(
      "_id callStatus callDuration callSummary recordingUrl intents messages " +
      "callSid isCompleted createdOn userId adminId campaignId transcription"
    );
    if (!chat) return res.status(404).json({ status: false, message: "Call not found" });

    // Separate dynamic intents from the merged intents object
    const allIntents: Record<string, any> = (chat.intents as any) ?? {};

    // _dynamic_intents is the audit tag written by update_call_analysis_db
    const dynamicIntents = allIntents._dynamic_intents ?? {};

    // Present merged intents without the internal audit key
    const mergedIntents = { ...allIntents };
    delete mergedIntents._dynamic_intents;

    // Transcription — stored as JSON string or plain array
    let transcription: any[] = [];
    const rawTranscription = (chat as any).transcription;
    if (rawTranscription) {
      try {
        transcription = typeof rawTranscription === "string"
          ? JSON.parse(rawTranscription)
          : rawTranscription;
      } catch (_) {}
    }

    // Pull summary messages from chat timeline
    const summaryMessages = (chat.messages as any[])
      .filter((m: any) =>
        m.flowNodeId === "call_summary" ||
        m.message?.startsWith("📞 Call")
      )
      .map((m: any) => m.message);

    return res.status(200).json({
      status: true,
      data: {
        callStatus:     (chat as any).callStatus,
        callDuration:   (chat as any).callDuration,
        callSummary:    (chat as any).callSummary,
        recordingUrl:   (chat as any).recordingUrl,
        isCompleted:    chat.isCompleted,
        intents:        mergedIntents,       // all intents merged
        dynamic_intents: dynamicIntents,    // only the ones extracted from audio by dynamic fields
        transcription,
        summaryMessages,
        messages:       chat.messages,
        chatId:         chat._id,
        campaignId:     chat.campaignId,
        createdOn:      chat.createdOn,
      },
    });
  } catch (err) {
    console.error("[getCallAnalysis]", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};