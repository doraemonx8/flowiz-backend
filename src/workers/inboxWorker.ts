import { Worker } from "bullmq";
import IORedis from "ioredis";
import Imap from "imap";
import { simpleParser } from 'mailparser';
import {getEmailHistory,isEmailChatByMessageId,addMailMessage, updateEmailData,updateEmailChat} from "../models/emailModel";
import { sendMessageToAgent } from "../utils/eventManager";
import { getJobIdsToRemove } from "../models/jobModel";
import { deleteEmailJobs, getIMAPHost } from "../utils/emailUtil";
import { getCurrentDate } from "../utils/inboxUtil";


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
                                            const pendingEmailJobs =await getJobIdsToRemove(chat.companyId,chat.adminId,chat.flowId,chat.leadId);
                                            //removing these jobs
                                            await deleteEmailJobs(pendingEmailJobs as Array<string>);
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
                                            //updating chat for agent handover
                                            updateEmailChat(chat._id,{isAgentHandover:true});
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
                console.error(`[Job ${jobId}] ❌ IMAP Connection error for ${email}:`, err);
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


// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down inbox worker...");
  await inboxWorker.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default inboxWorker;