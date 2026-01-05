import { Worker } from "bullmq";
import IORedis from "ioredis";
import Imap from "imap";
import { simpleParser } from 'mailparser';
import {getEmailHistory,isEmailChatByMessageId,addMailMessage, updateEmailData,updateEmailChat} from "../models/emailModel";
import { sendMessageToAgent } from "../utils/eventManager";
import { addJob, getJobIdsToRemove } from "../models/jobModel";
import { deleteEmailJobs, getIMAPHost } from "../utils/emailUtil";
import { getCurrentDate } from "../utils/inboxUtil";
import { removeScheduledJobs, scheduleMessages } from "../utils/scheduleUtil";
import { emailQueue } from "../queues/campaignQueue";
import { EmailNode, FlowData, FlowNode } from "../types/flow.type";


const connection = new IORedis({ 
    host:'127.0.0.1',
    port:6379,  
    maxRetriesPerRequest: null 
});


// Key for tracking currently processing emails in Redis
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
        let historyDate: string | null = null;
        const history = await getEmailHistory(userId, email);
        if(!history){
            console.warn("No history found for email : ",email);
            return { skipped: true, reason: 'Already processing' };
        }

        const imapHost = getIMAPHost(host as string);
        const imap = new Imap({
            user: email,
            password: password,
            host: imapHost,
            port: 993,
            tls: true,
            tlsOptions: {
                rejectUnauthorized: false,
            },
        });

        await new Promise<any>((resolve, reject) => {
            imap.once('ready', () => {
                imap.openBox('INBOX', true, (err: any, box: any) => {
                    if (err) {
                        imap.end(); 
                        return reject(new Error(`Failed to open inbox: ${err.message}`));
                    }

                    const searchCriteria = ['UNSEEN',['SINCE', history]];
                    imap.search(searchCriteria, async(err, results) => {
                        if (err) {
                            imap.end();
                            return reject(new Error(`IMAP search error: ${err.message}`));
                        }
                        if (!results || results.length === 0) {
                            console.log(`[Job ${jobId}] No new unseen messages for ${email} since ${historyDate}.`);
                            imap.end();
                            return resolve("No new unseen messages");
                        }
                        console.log(`[Job ${jobId}] Found ${results.length} new messages for ${email}.`);
                        const fetch = imap.fetch(results, {
                            bodies: '', 
                            struct: true,
                        });

                        let messagesProcessed = 0;
                        let messagesFailed = 0;
                        fetch.on('message', (msg, seqno) => {
                            let rawData = '';
                            msg.on('body', (stream) => {
                                stream.on('data', (chunk) => {
                                    rawData += chunk.toString('utf8');
                                });
                            });
                            msg.once('end', async () => {
                                try {
                                    const parsed = await simpleParser(rawData);
                                    const prevMessageId = parsed.inReplyTo || null;
                                    const currMessageId = parsed.messageId || null;

                                    if (!currMessageId) {
                                        console.warn(`[Job ${jobId}] Message ${seqno} for ${email} has no Message-ID. Skipping chat check.`);
                                        return;
                                    }
                                    // Checking if messageId belongs to a chat
                                    if (prevMessageId) {
                                        const chat = await isEmailChatByMessageId(prevMessageId,currMessageId);
                                        if (chat) {
                                            // Adding message in chat
                                            await addMailMessage(chat._id, {
                                                isBot: false,
                                                isAgent: false,
                                                messageId: currMessageId,
                                                message: parsed.text,
                                                subject: parsed.subject,
                                                createdOn: new Date().getTime()
                                            });
                                            //removing any email jobs
                                            await removeScheduledJobs({userId : chat.adminId,flowId:chat.flowId,companyId:chat.companyId,leadId:chat.leadId});

                                            
                                            // Sending message to agent
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

                                            //send next mail & schedule mails
                                            await sendNextMail(chat,email);
                                            messagesProcessed++;
                                        } else {
                                            console.log(`[Job ${jobId}] Message ${currMessageId} is a reply but not linked to existing chat via ${prevMessageId}.`);
                                        }
                                    }
                                } catch (msgErr) {
                                    console.error(`[Job ${jobId}] Error processing message ${seqno} for ${email}:`, msgErr);
                                    messagesFailed++;
                                }
                            });
                        });

                        fetch.once('error', (err) => {
                            console.error(`[Job ${jobId}] Fetch stream error for ${email}:`, err);
                            imap.end();
                            reject(new Error(`IMAP fetch stream error: ${err.message}`));
                        });

                        fetch.once('end', async () => {
                            console.log(`[Job ${jobId}] ✅ Done fetching messages for ${email}. Processed: ${messagesProcessed}, Failed: ${messagesFailed}`);
                            imap.end();
                            // await updateEmailData({ history: getCurrentDate() }, userId, email);
                            resolve("completed");
                        });
                    });
                });
            });
            imap.once('error', (err: any) => {
                console.error(`[Job ${jobId}] IMAP Connection error for ${email}:`, err);
                reject(new Error(`IMAP connection error: ${err.message}`));
            });
            imap.once('end', () => {
                console.log(`[Job ${jobId}] 🔚 IMAP Connection closed for ${email}.`);
            });
            imap.connect();
        });

        //updating history date
        await updateEmailData({ history: getCurrentDate() }, userId, email);

    } catch (err: any) {
        console.error(`[Job ${jobId}] An unhandled error occurred for ${email}:`, err);
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

inboxWorker.on('ready',()=> console.log("Inbox worker is ready"));
inboxWorker.on('closed', () => console.log('Inbox Worker closed.'));


inboxWorker.on('completed', job => {
    console.log(`[Job ${job.id}] Completed job for ${job.data.email}`);
});

inboxWorker.on('failed', (job : any, err) => {
    console.error(`[Job ${job.id}] Failed job for ${job.data.email}: ${err.message}`);
});


const sendNextMail=async(chat : any,email : string)=>{

    const {flowData,currentFlowNodeId,userId,campaignId,companyId,emailAuth,_id,flowId}=chat;

    const parsedFlowData : FlowData=JSON.parse(flowData);
    const current = parsedFlowData.find(node  => node.id === currentFlowNodeId);
    if(!current)throw new Error(`Invalid current node Id found in chat :${_id}`);

    if(current.type!=="email")throw new Error(`Invalid Flow Node found in chat : ${_id}`);

    if(!current.next.length) {
        //updating chat for agent handover
        return updateEmailChat(chat._id,{isAgentHandover:true});
    }

    const next = current.next[0];
    const nextEmail = parsedFlowData.find(node => node.id === next);
    if(!nextEmail)throw new Error(`Invalid next node Id found : ${_id}`);
    if(nextEmail.type!=="email")throw new Error(`Invalid flow node found in chat : ${_id}`);
    const payload = { subject: nextEmail.data.subject, body: nextEmail.data.body, leadId: userId, flowId, email, campaignId, companyId, userId, nodeId: next, flowData, userEmailData: emailAuth };
    const jobId = `${new Date().getTime()}_email_${next}`;
    await addJob(jobId as string, chat.companyId, userId, chat.flowId, chat.campaignId, next, "email");
    await emailQueue.add("email-job", payload, { jobId});
    
    const emailsToSchedule=scheduleMessages({currentNodeId : currentFlowNodeId,flowData},"email");
    for(const emailJob of emailsToSchedule){
        const delayHour = Number(emailJob.delay?.hourDelay);
        const delayMin = Number(emailJob.delay?.minDelay);
        // Calculate delay in milliseconds
        const delayInMs = (delayHour * 60 * 60 * 1000) + (delayMin * 60 * 1000);
        const jobId = `${new Date().getTime()}_email`;
        payload.nodeId=jobId;
        payload.subject=emailJob.subject as string;
        payload.body=emailJob.body as string;
        await emailQueue.add("email-job", payload, { delay: delayInMs, jobId });
        //adding in jobs
        await addJob(jobId, companyId, userId, flowId, campaignId, jobId, "email");
    }
}

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down inbox worker...");
  await inboxWorker.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default inboxWorker;