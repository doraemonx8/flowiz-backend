import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { callQueue, emailQueue, whatsappQueue } from "../queues/campaignQueue";
import { updateCampaignStatus } from "../utils/redisUtil";
import { updateCampaignStatusDB } from "../models/campaignModel";
import {
  createEmailJobsDataFromFlow,
  createWhatsAppJobsDataFromFlow,
  createCallJobsDataFromFlow,
  LeadData,
} from "../utils/channelWorkerUtil";
import { emailWorker, callWorker, whatsappWorker } from "./channelWorker";
import { getWABAIDAndToken } from "../models/templateModel";
import { addJob } from "../models/jobModel";

const temp_email_worker = emailWorker;
const temp_whatsapp_worker = whatsappWorker;

// Create Redis connections
const connection = new IORedis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null
});

// Define types for job data
interface Lead {
  phone: string;
  email: string;
  name: string;
  website: string;
  country: string;
  id: string | number;
}

interface SubFlow {
  type: string; // "1" email | "2" web/chatbot | "3" call | "4" whatsapp
  flowData: string | any,
  json: string | any
  id: string
  configData?: any
}

interface CampaignJobData {
  leads: Lead[];
  subFlows: SubFlow[];
  companyId: string;
  campaignId: string;
  campaignName: string;
  scheduledAt: any
  userId: string
  isEmailAgent: boolean;
  isCallAgent: boolean;
  isWhatsappAgent: boolean;
  userEmailData: Array<any>;
}


// Campaign worker
const campaignWorker = new Worker<CampaignJobData>("campaign-queue", async (job: Job<CampaignJobData>) => {
  const { leads, subFlows, campaignId, companyId, userId, isEmailAgent, isCallAgent, isWhatsappAgent, userEmailData } = job.data;

  //updating campaign status
  await updateCampaignStatus(campaignId, 'running');
  await updateCampaignStatusDB(campaignId, 'running');

  let leadCount = 0;
  // Running campaign for each lead
  for (const lead of leads) {
    leadCount++;
    const { phone, email, id, name } = lead;
    // Full lead object — channelWorkerUtil resolves @intent references from this
    const leadData: LeadData = { id, name, email, phone };


    for (const subFlow of subFlows) {
      // Type EMAIL
      if (subFlow.type === "1" && isEmailAgent && email) {
        console.log("Adding job in email queue");
        //looping over the subflow to add email job
        // const emailJobsData: Array<any> = createEmailJobsDataFromFlow(subFlow, name);
        const emailJobsData: any[] = createEmailJobsDataFromFlow(subFlow, leadData);
        //getting userEmail
        const userEmail = userEmailData[Math.ceil(leadCount / 100) - 1];

        for (const emailData of emailJobsData) {
          const payload = { subject: emailData.subject, body: emailData.body, attachments: emailData.attachments, leadId: id, flowId: subFlow.id, email, phone, campaignId, companyId, userId, nodeId: emailData.id, flowData: subFlow.flowData || subFlow.json, userEmailData: userEmail };
          const baseDelay = (leadCount - 1) * 1000 * 120; // 2-min stagger per lead
          if (!emailData.delay) {
            //adding in jobs
            const jobId = `${new Date().getTime()}_email_${id}`;
            await addJob(jobId as string, companyId, userId, subFlow.id, campaignId, id as string, "email");
            await emailQueue.add("email-job", payload, { jobId, delay: baseDelay });
          } else {
            const delayInMs =
                Number(emailData.delay.hourDelay) * 60 * 60 * 1000 +
                Number(emailData.delay.minDelay)  * 60 * 1000 +
                baseDelay;

            const jobId = `${new Date().getTime()}_email_${id}`;
            await emailQueue.add("email-job", payload, { delay: delayInMs, jobId });
            //adding in jobs
            await addJob(jobId, companyId, userId, subFlow.id, campaignId, id as string, "email");
          }
        }
      } else if (subFlow.type === "2") {
        console.log("Skipping chatbot flow");

      } else if (subFlow.type === "3" && isCallAgent) {
        console.log("Adding call jobs for lead:", id);

        const callJobsData = createCallJobsDataFromFlow(subFlow, leadData);
        if (!callJobsData.length) continue;

        // Parse configData from this call subflow
        let callConfig: Record<string, any> = {};
        try {
          if (subFlow.configData) {
            callConfig = typeof subFlow.configData === "string"
              ? JSON.parse(subFlow.configData)
              : subFlow.configData;
          }
        } catch (_) {}

        const aiName        = callConfig.botName      || callConfig.agentName || "AI Assistant";
        const campaignName  = job.data.campaignName    || "";
        const dynamicFields = callConfig.dynamicFields   || callConfig.dynamic_fields || [];

        const sharedMeta = { campaignName, aiName, dynamicFields };

        // Stagger 30 s per lead so we don't flood the call server
        const baseDelay = (leadCount - 1) * 30_000;

        // First call (immediate / base delay only)
        const firstCall = callJobsData[0];
        const firstJobId = `${Date.now()}_call_${id}`;

        await callQueue.add("call-job", {
          subFlow, leadId: id, email, phone, name,
          campaignId, companyId, userId,
          flowId:  subFlow.id,
          nodeId:  firstCall.id,
          script:  firstCall.script,
          title:   firstCall.title,
          ...sharedMeta,
        }, { jobId: firstJobId, delay: baseDelay });

        await addJob(firstJobId, companyId, userId, subFlow.id, campaignId, String(id), "call");

        // No-answer retry calls (from followUp nodes) — only if no answer
        for (const retryCall of callJobsData.slice(1)) {
          if (!retryCall.delay) continue;

          const retryDelayMs =
            Number(retryCall.delay.hours) * 3_600_000 +
            Number(retryCall.delay.mins)  * 60_000    +
            baseDelay;

          const retryJobId = `${Date.now()}_call_retry_${id}`;

          await callQueue.add("call-job", {
            subFlow, leadId: id, email, phone, name,
            campaignId, companyId, userId,
            flowId:  subFlow.id,
            nodeId:  retryCall.id,
            script:  retryCall.script,
            title:   retryCall.title,
            ...sharedMeta,
          }, { jobId: retryJobId, delay: retryDelayMs });

          await addJob(retryJobId, companyId, userId, subFlow.id, campaignId, String(id), "call");
        }
      // } else if (subFlow.type === "4" && isWhatsappAgent && phone) {
      //   console.log("Adding job in whatsapp queue");
      //   const firstMessageNode = subFlow.flowData.filter((obj: any) => obj.data.isFirst === true)[0];
      //   const { phoneNumberId } = await getWABAIDAndToken(userId) || {};

      //   const jobId = `${new Date().getTime()}_whatsapp_${id}`;
      //   await whatsappQueue.add("whatsapp-job", { flowData: subFlow.flowData, flowId: subFlow.id, leadId: id, phone, campaignId, companyId, nodeId: firstMessageNode.id, message: firstMessageNode.data, userId, botName: "", botDescription: "", phoneNumberId }, { jobId });

      //   //adding in jobs
      //   await addJob(jobId, companyId, userId, subFlow.id, campaignId, id as string, "whatsapp");

      // }
      } else if (subFlow.type === "4" && isWhatsappAgent && phone) {
          console.log("Adding job in whatsapp queue");
 
          // Build resolved job list — first message + any follow-ups
          const waJobsData: any[] = createWhatsAppJobsDataFromFlow(subFlow, leadData);
          if (!waJobsData.length) continue;
 
          const { phoneNumberId } = (await getWABAIDAndToken(userId)) || {};
          const firstJob = waJobsData[0];
 
          // Enqueue the first (immediate) message
          const jobId = `${Date.now()}_whatsapp_${id}`;
          await whatsappQueue.add(
            "whatsapp-job",
            {
              flowData:       subFlow.flowData,
              flowId:         subFlow.id,
              leadId:         id,
              phone,
              campaignId,
              companyId,
              nodeId:         firstJob.id,
              // resolved message — no raw {{placeholders}} remain
              message:        firstJob.rawData ?? firstJob,
              resolvedMessage: firstJob.message,
              varMap:          firstJob.varMap, 
              userId,
              botName:        "",
              botDescription: "",
              phoneNumberId,
            },
            { jobId }
          );
          await addJob(jobId, companyId, userId, subFlow.id, campaignId, id as string, "whatsapp");
 
          // Enqueue follow-up messages with their delays
          for (const waJob of waJobsData.slice(1)) {
            const delayInMs =
              Number(waJob.delay?.hourDelay ?? 0) * 60 * 60 * 1000 +
              Number(waJob.delay?.minDelay  ?? 0) * 60 * 1000;
 
            const followUpJobId = `${Date.now()}_whatsapp_followup_${id}`;
            await whatsappQueue.add(
              "whatsapp-job",
              {
                flowData:        subFlow.flowData,
                flowId:          subFlow.id,
                leadId:          id,
                phone,
                campaignId,
                companyId,
                nodeId:          firstJob.id,       // keep original node context
                message:         waJob,             // raw job for worker compat
                resolvedMessage: waJob.message,     // already resolved text
                varMap:          waJob.varMap, 
                userId,
                botName:         "",
                botDescription:  "",
                phoneNumberId,
              },
              { jobId: followUpJobId, delay: delayInMs }
            );
            await addJob(followUpJobId, companyId, userId, subFlow.id, campaignId, id as string, "whatsapp");
        }
      }
    }
  }
},
  { connection, concurrency: 2, limiter: { max: 10, duration: 1000 } }
);

// Worker events
campaignWorker.on("completed", async (job) => {
  console.log(`Campaign Job with ID ${job.id} has been completed`);
});

campaignWorker.on("failed", (job, err) => {
  console.error(`Campaign Job with ID ${job?.id} has failed:`, err);
});

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down campaign worker...");
  await campaignWorker.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { campaignWorker };
