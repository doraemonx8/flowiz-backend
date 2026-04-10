/**
 * callEndedController.ts
 *
 * The Python Acefone server should POST to /api/calls/call-ended when a call
 * finishes. This updates the MongoDB chat document with outcome data and
 * marks the BullMQ job as completed.
 *
 * Expected payload from Python:
 * {
 *   "callTaskId":   "celery-task-uuid",   // task_id returned by /make-call
 *   "callId":       "acefone-call-id",
 *   "duration":     120,                  // seconds
 *   "status":       "completed" | "no-answer" | "failed",
 *   "transcript":   "...",                // optional — from OpenAI Realtime
 *   "recordingUrl": "https://...",        // optional
 *   "companyId":    "1"                   // so we can fire SSE event
 * }
 */

import { Request, Response } from "express";
import Chat from "../models/schema";
import { sendMessageToAgent } from "../utils/eventManager";

export const callEndedWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      callTaskId, callId, duration, status,
      transcript, recordingUrl, companyId,
    } = req.body;

    if (!callTaskId) {
      return res.status(400).json({ status: false, message: "callTaskId is required" });
    }

    // Find the chat that was created when the call was initiated.
    const chat = await Chat.findOne({ callTaskId });

    if (!chat) {
      console.warn(`[callEndedWebhook] No chat found for callTaskId: ${callTaskId}`);
      // Still return 200 so Python doesn't retry endlessly.
      return res.status(200).json({ status: true, message: "No matching chat (already processed or unknown)" });
    }

    // Build the summary message that goes into the messages array.
    const summaryLines: string[] = [
      `📞 Call ended — status: ${status ?? "unknown"}`,
      duration != null ? `⏱ Duration: ${duration}s` : "",
      recordingUrl ? `🎙 Recording: ${recordingUrl}` : "",
    ].filter(Boolean);

    if (transcript) {
      summaryLines.push("📝 Transcript:", transcript);
    }

    const summaryMessage = summaryLines.join("\n");

    // Append the call-end summary to the existing messages array.
    chat.messages.push({
      isBot:      false,
      flowNodeId: chat.currentFlowNodeId,
      message:    summaryMessage,
      createdOn:  Math.floor(Date.now() / 1000),
      isAgent:    false,
    });

    // Mark call as completed and store Acefone call ID.
    (chat as any).callId       = callId ?? null;
    (chat as any).callDuration = duration ?? null;
    (chat as any).callStatus   = status ?? null;
    (chat as any).isCompleted  =
      status === "completed" || status === "answered";

    await chat.save();

    // Notify dashboard via SSE.
    sendMessageToAgent(chat.companyId, {
      type:   "messageAdded",
      chatId: chat._id,
      message: {
        isBot:     false,
        message:   summaryMessage,
        createdOn: new Date().getTime(),
        isSeen:    false,
      },
    });

    return res.status(200).json({ status: true, message: "Call ended processed" });
  } catch (err) {
    console.error("[callEndedWebhook] Error:", err);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};