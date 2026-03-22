import { Worker } from "bullmq";
import IORedis from "ioredis";
import Imap from "imap";
import { simpleParser } from 'mailparser';
import { getEmailHistory, isEmailChatByMessageId, addMailMessage, updateEmailData, updateEmailChat } from "../models/emailModel";
import { sendMessageToAgent } from "../utils/eventManager";
import { addJob } from "../models/jobModel";
import { deleteEmailJobs, getIMAPHost } from "../utils/emailUtil";
import { getCurrentDate } from "../utils/inboxUtil";
import { removeScheduledJobs, scheduleMessages } from "../utils/scheduleUtil";
import { emailQueue } from "../queues/campaignQueue";
import { FlowData } from "../types/flow.type";
import { decideNextNode } from "../utils/botUtilPrompt";
import { getCampaignIdByLeadsId } from "../models/campaignModel";


const connection = new IORedis({
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null
});

const PROCESSING_EMAILS_REDIS_KEY = 'inbox:currently_processing_emails';


const inboxWorker = new Worker('inbox-queue', async (job: any) => {
    const { email, password, host, userId } = job.data;
    const jobId = job.id;

    console.log(`[Job ${jobId}] Attempting to process inbox for: ${email}`);

    const isAlreadyProcessing = await connection.sismember(PROCESSING_EMAILS_REDIS_KEY, email);
    if (isAlreadyProcessing) {
        console.warn(`[Job ${jobId}] Email ${email} is already being processed. Skipping this run.`);
        return;
    }

    await connection.sadd(PROCESSING_EMAILS_REDIS_KEY, email);
    try {
        const history = await getEmailHistory(userId, email);
        if (!history) {
            console.warn("No history found for email:", email);
            return { skipped: true, reason: 'No history' };
        }

        const imapHost = getIMAPHost(host as string);
        const imap = new Imap({
            user: email,
            password: password,
            host: imapHost,
            port: 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false },
        });

        await new Promise<any>((resolve, reject) => {
            imap.once('ready', () => {
                imap.openBox('INBOX', false, (err: any) => {
                    if (err) {
                        imap.end();
                        return reject(new Error(`Failed to open inbox: ${err.message}`));
                    }

                    const searchCriteria = ['UNSEEN', ['SINCE', history]];
                    imap.search(searchCriteria, async (err, results) => {
                        if (err) {
                            imap.end();
                            return reject(new Error(`IMAP search error: ${err.message}`));
                        }
                        if (!results || results.length === 0) {
                            console.log(`[Job ${jobId}] No new unseen messages for ${email}.`);
                            imap.end();
                            return resolve("No new unseen messages");
                        }

                        console.log(`[Job ${jobId}] Found ${results.length} new messages for ${email}.`);
                        const fetch = imap.fetch(results, { bodies: '', struct: true, markSeen: true });

                        let messagesProcessed = 0;
                        let messagesFailed = 0;

                        fetch.on('message', (msg, seqno) => {
                            let rawData = '';
                            msg.on('body', (stream) => {
                                stream.on('data', (chunk) => { rawData += chunk.toString('utf8'); });
                            });
                            msg.once('end', async () => {
                                try {
                                    const parsed = await simpleParser(rawData);
                                    const prevMessageId = parsed.inReplyTo || null;
                                    const currMessageId = parsed.messageId || null;

                                    if (!currMessageId) {
                                        console.warn(`[Job ${jobId}] Message ${seqno} has no Message-ID. Skipping.`);
                                        return;
                                    }

                                    if (prevMessageId) {
                                        const chat = await isEmailChatByMessageId(prevMessageId, currMessageId);
                                        console.log(`[Job ${jobId}] isEmailChatByMessageId for inReplyTo=${prevMessageId}:`, chat);

                                        if (chat) {
                                            // 1. Save the lead's reply into the chat
                                            await addMailMessage(chat._id, {
                                                isBot: false,
                                                isAgent: false,
                                                messageId: currMessageId,
                                                message: parsed.text,
                                                subject: parsed.subject,
                                                createdOn: new Date().getTime()
                                            });

                                            // 2. Cancel any pending follow-up jobs (lead has replied)
                                            await removeScheduledJobs({
                                                userId: chat.adminId,
                                                flowId: chat.flowId,
                                                companyId: chat.companyId,
                                                leadId: chat.userId
                                            });

                                            // 3. Notify connected agents
                                            await sendMessageToAgent(chat.companyId, {
                                                type: "messageAdded",
                                                data: {
                                                    chatId: chat._id,
                                                    message: {
                                                        isBot: false,
                                                        isAgent: false,
                                                        createdOn: new Date().getTime(),
                                                        subject: parsed.subject,
                                                        message: parsed.text,
                                                        messageId: currMessageId
                                                    }
                                                }
                                            });

                                            // 4. Decide and send the next flow email
                                            await sendNextMail(chat, email, parsed.text || "");
                                            messagesProcessed++;
                                        } else {
                                            console.warn(`[Job ${jobId}] No chat found for inReplyTo: ${prevMessageId}`);
                                        }
                                    }
                                } catch (msgErr) {
                                    console.error(`[Job ${jobId}] Error processing message ${seqno} for ${email}:`, msgErr);
                                    messagesFailed++;
                                }
                            });
                        });

                        fetch.once('error', (err) => {
                            console.error(`[Job ${jobId}] Fetch stream error:`, err);
                            imap.end();
                            reject(new Error(`IMAP fetch stream error: ${err.message}`));
                        });

                        fetch.once('end', async () => {
                            console.log(`[Job ${jobId}] Done. Processed: ${messagesProcessed}, Failed: ${messagesFailed}`);
                            imap.end();
                            await updateEmailData({ history: getCurrentDate() }, userId, email);
                            resolve("completed");
                        });
                    });
                });
            });

            imap.once('error', (err: any) => {
                console.error(`[Job ${jobId}] IMAP Connection error:`, err);
                reject(new Error(`IMAP connection error: ${err.message}`));
            });
            imap.once('end', () => {
                console.log(`[Job ${jobId}] IMAP Connection closed for ${email}.`);
            });
            imap.connect();
        });

        await updateEmailData({ history: getCurrentDate() }, userId, email);

    } catch (err: any) {
        console.error(`[Job ${jobId}] Unhandled error for ${email}:`, err);
        throw err;
    } finally {
        await connection.srem(PROCESSING_EMAILS_REDIS_KEY, email);
        console.log(`[Job ${jobId}] Released lock for ${email}.`);
    }
}, {
    connection,
    concurrency: 1,
    limiter: { max: 3, duration: 1000 }
});

inboxWorker.on('ready', () => console.log("Inbox worker is ready"));
inboxWorker.on('closed', () => console.log('Inbox Worker closed.'));
inboxWorker.on('completed', job => console.log(`[Job ${job.id}] Completed for ${job.data.email}`));
inboxWorker.on('failed', (job: any, err) => console.error(`[Job ${job.id}] Failed for ${job.data.email}: ${err.message}`));


/**
 * Decide and enqueue the next email after a lead replies.
 *
 * Decision nodes can carry ANY arbitrary condition
 * (e.g. "If user is interested in pricing", "If user wants a demo", etc.).
 *
 * We use `decideNextNode` — the same AI function BotGraph._sendMessage uses —
 * so the LLM evaluates the reply against each decision's `content` and picks
 * the right branch regardless of what the conditions say.
 *
 * Flow node layout handled:
 *
 *   emailX ──► decision1 ("If the user is interested in X") ──► emailA
 *          ──► decision2 ("If the user asks about pricing")  ──► emailB
 *          ──► followUp1 [delay→email, delay→email]          (no-reply path)
 *
 * Steps:
 *  1. Separate current.next into decisionNodes, followUpNodes, directEmails
 *  2. If decisions exist → call decideNextNode(decisions, { reply }) → get winning decision → send its email
 *  3. If no decision resolves (truly off-topic) → schedule followUp emails instead
 *  4. If no followUp either → hand over to agent
 *  5. After sending, update currentFlowNodeId on the chat for the next reply
 */
const sendNextMail = async (chat: any, email: string, replyText: string) => {

    // chat.userId  = lead ID (e.g. 6704)
    // chat.adminId = campaign owner / email account owner (e.g. 86)
    const {
        flowData,
        currentFlowNodeId,
        userId: leadId,
        adminId,
        companyId,
        emailAuth,
        _id,
        flowId
    } = chat;

    // emailAuth is stored as a JSON string
    const parsedEmailAuth = typeof emailAuth === 'string' ? JSON.parse(emailAuth) : emailAuth;

    // campaignId may not be on the chat document — fetch it if missing
    const campaignId: string = chat.campaignId || (await getCampaignIdByLeadsId(leadId) as string);

    const parsedFlowData: FlowData = JSON.parse(flowData);
    console.log("[sendNextMail] currentFlowNodeId:", currentFlowNodeId);

    // ── Validate the current (last-sent) node ───────────────────────────
    const currentNode = parsedFlowData.find(n => n.id === currentFlowNodeId);
    if (!currentNode) throw new Error(`currentFlowNodeId '${currentFlowNodeId}' not found in chat: ${_id}`);
    if (currentNode.type !== "email") throw new Error(`Expected email node at '${currentFlowNodeId}', got '${currentNode.type}' in chat: ${_id}`);

    if (!currentNode.next?.length) {
        console.log("[sendNextMail] No next nodes — handing over to agent.");
        return updateEmailChat(_id, { isAgentHandover: true });
    }

    // ── Categorise nodes referenced in current.next ──────────────────────
    const allNextNodes = currentNode.next
        .map(id => parsedFlowData.find(n => n.id === id))
        .filter(Boolean) as NonNullable<typeof parsedFlowData[number]>[];

    const decisionNodes = allNextNodes.filter(n => n.type === "decision");
    const followUpNodes  = allNextNodes.filter(n => n.type === "followUp");
    const directEmails   = allNextNodes.filter(n => n.type === "email");

    console.log("[sendNextMail] decisions:", decisionNodes.map(n => n.id), "| followUps:", followUpNodes.map(n => n.id), "| directEmails:", directEmails.map(n => n.id));

    let targetNodeId: string | null = null;

    // ── AI decision routing ──────────────────────────────────────────────
    if (decisionNodes.length > 0) {

        // Pass the lead's reply as { reply: "..." } so the LLM can evaluate
        // each decision node's `content` condition against it.
        // This is identical to how BotGraph._sendMessage calls decideNextNode.
        const decisionResult = JSON.parse(
            await decideNextNode(
                JSON.stringify(decisionNodes),
                JSON.stringify({ reply: replyText })
            )
        );

        console.log("[sendNextMail] decideNextNode result:", decisionResult);

        // decideNextNode returns { next_node: "<decision_node_id>" }
        // Resolve that decision's first next[] to get the actual email node.
        const winningDecision = parsedFlowData.find(
            n => n.id === decisionResult.next_node && n.type === "decision"
        );

        if (winningDecision?.next?.length) {
            targetNodeId = winningDecision.next[0];
            console.log(`[sendNextMail] '${winningDecision.id}' won → target: ${targetNodeId}`);
        } else {
            console.warn("[sendNextMail] decideNextNode returned unresolvable node:", decisionResult.next_node, "— falling back.");
        }
    }

    // ── Fallback when no decision branch resolved ────────────────────────
    if (!targetNodeId) {
        if (followUpNodes.length > 0) {
            console.log("[sendNextMail] No decision resolved — scheduling follow-up sequence.");
            await scheduleFollowUps({
                currentNodeId: currentFlowNodeId,
                parsedFlowData,
                leadId,
                adminId,
                campaignId,
                companyId,
                flowId,
                rawFlowData: flowData,
                email,
                parsedEmailAuth,
            });
            return;
        }

        if (directEmails.length > 0) {
            // Linear flow with no decisions
            targetNodeId = directEmails[0].id;
            console.log("[sendNextMail] Linear advance → next email:", targetNodeId);
        } else {
            console.log("[sendNextMail] No actionable next node — handing over to agent.");
            return updateEmailChat(_id, { isAgentHandover: true });
        }
    }

    // ── Resolve and send the target email node ───────────────────────────
    const nextEmailNode = parsedFlowData.find(n => n.id === targetNodeId);
    if (!nextEmailNode) throw new Error(`Target node '${targetNodeId}' not found in chat: ${_id}`);
    if (nextEmailNode.type !== "email") throw new Error(`Target node '${targetNodeId}' is '${nextEmailNode.type}', expected 'email' in chat: ${_id}`);

    // Support both flat { subject, body } (flow builder) and nested { data: { subject, body } }
    const emailSubject = (nextEmailNode as any).subject ?? (nextEmailNode as any).data?.subject;
    const emailBody    = (nextEmailNode as any).body    ?? (nextEmailNode as any).data?.body;

    const basePayload = {
        leadId,
        flowId,
        email,
        campaignId,
        companyId,
        userId:        adminId,          // adminId owns the sending account
        flowData,                        // raw JSON string — channelWorker expects this
        userEmailData: parsedEmailAuth,
    };

    const jobId = `${Date.now()}_email_${targetNodeId}`;
    console.log("[sendNextMail] Enqueuing email job:", jobId, "→ node:", targetNodeId);

    await addJob(jobId, companyId, adminId, flowId, campaignId, targetNodeId as string, "email");
    await emailQueue.add("email-job", { ...basePayload, subject: emailSubject, body: emailBody, nodeId: targetNodeId }, { jobId });

    // Persist the new current node so the NEXT reply routes from the right place
    await updateEmailChat(_id, { currentFlowNodeId: targetNodeId });

    // Schedule any follow-ups branching off the newly-sent node
    const followUpsToSchedule = scheduleMessages(
        { currentNodeId: targetNodeId as string, flowData: parsedFlowData },
        "email"
    );

    for (const emailJob of followUpsToSchedule) {
        const delayInMs =
            (Number(emailJob.delay?.hourDelay) * 60 * 60 * 1000) +
            (Number(emailJob.delay?.minDelay)  * 60 * 1000);

        const followUpJobId = `${Date.now()}_email_followup_${targetNodeId}`;
        await emailQueue.add("email-job", {
            ...basePayload,
            subject: emailJob.subject as string,
            body:    emailJob.body    as string,
            nodeId:  followUpJobId,
        }, { delay: delayInMs, jobId: followUpJobId });

        await addJob(followUpJobId, companyId, adminId, flowId, campaignId, followUpJobId, "email");
    }
};


/**
 * Enqueue all email steps inside a followUp node.
 * Used when the lead's reply doesn't match any decision condition
 * (neutral / off-topic) and we want to keep the nurture sequence running.
 */
const scheduleFollowUps = async (params: {
    currentNodeId: string;
    parsedFlowData: FlowData;
    leadId: string;
    adminId: string;
    campaignId: string;
    companyId: string;
    flowId: string;
    rawFlowData: string;
    email: string;
    parsedEmailAuth: Record<string, any>;
}) => {
    const {
        currentNodeId, parsedFlowData,
        leadId, adminId, campaignId, companyId,
        flowId, rawFlowData, email, parsedEmailAuth,
    } = params;

    const emailsToSchedule = scheduleMessages({ currentNodeId, flowData: parsedFlowData }, "email");
    console.log("[scheduleFollowUps] Scheduling", emailsToSchedule.length, "follow-up email(s).");

    for (const emailJob of emailsToSchedule) {
        // const delayInMs =
        //     (Number(emailJob.delay?.hourDelay) * 60 * 60 * 1000) +
        //     (Number(emailJob.delay?.minDelay)  * 60 * 1000);
        const delayInMs = 2 * 60 * 1000; // TEMP: 2 minutes

        const jobId = `${Date.now()}_email_followup`;
        await emailQueue.add("email-job", {
            subject:       emailJob.subject as string,
            body:          emailJob.body    as string,
            leadId,
            flowId,
            email,
            campaignId,
            companyId,
            userId:        adminId,
            nodeId:        currentNodeId,
            flowData:      rawFlowData,
            userEmailData: parsedEmailAuth,
        }, { delay: delayInMs, jobId });

        await addJob(jobId, companyId, adminId, flowId, campaignId, currentNodeId, "email");
    }
};


// Graceful shutdown
const shutdown = async () => {
    console.log("Shutting down inbox worker...");
    await inboxWorker.close();
    process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default inboxWorker;