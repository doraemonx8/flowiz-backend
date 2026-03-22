import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { callQueue, emailQueue, whatsappQueue } from "../queues/campaignQueue";
import { updateCampaignStatus } from "../utils/redisUtil";
import { updateCampaignStatusDB } from "../models/campaignModel";
import { createEmailJobsDataFromFlow } from "../utils/channelWorkerUtil";
import { emailWorker, callWorker, whatsappWorker } from "./channelWorker";
import { getWABAIDAndToken } from "../models/templateModel";
import { addJob } from "../models/jobModel";
import { getUserEmailByCampaign } from "../models/userModel";

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
  id: string | number;
}

interface SubFlow {
  type: string; // "1" for email, "2" for WhatsApp, "3" for call
  flowData: string | any,
  json: string | any
  id: string
}

interface CampaignJobData {
  leads: Lead[];
  subFlows: SubFlow[];
  companyId: string;
  campaignId: string;
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

    for (const subFlow of subFlows) {
      // Type EMAIL
      if (subFlow.type === "1" && isEmailAgent && email) {
        console.log("Adding job in email queue");
        //looping over the subflow to add email job
        const emailJobsData: Array<any> = createEmailJobsDataFromFlow(subFlow, name);
        //getting userEmail
        const userEmail = userEmailData[Math.ceil(leadCount / 100) - 1];

        for (const emailData of emailJobsData) {
          const payload = { subject: emailData.subject, body: emailData.body, leadId: id, flowId: subFlow.id, email, phone, campaignId, companyId, userId, nodeId: emailData.id, flowData: subFlow.flowData || subFlow.json, userEmailData: userEmail };
          if (!emailData.delay) {
            //adding in jobs
            const jobId = `${new Date().getTime()}_email_${id}`;
            await addJob(jobId as string, companyId, userId, subFlow.id, campaignId, id as string, "email");
            await emailQueue.add("email-job", payload, { jobId, delay: (leadCount - 1) * 1000 * 120 }); //default 2min delay for each mail
          } else {
            const delayHour = Number(emailData.delay.hourDelay);
            const delayMin = Number(emailData.delay.minDelay);
            // Calculate delay in milliseconds
            const delayInMs = (delayHour * 60 * 60 * 1000) + (delayMin * 60 * 1000) + ((leadCount - 1) * 1000 * 120);

            const jobId = `${new Date().getTime()}_email_${id}`;
            await emailQueue.add("email-job", payload, { delay: delayInMs, jobId });
            //adding in jobs
            await addJob(jobId, companyId, userId, subFlow.id, campaignId, id as string, "email");
          }
        }
      } else if (subFlow.type === "2") {
        console.log("Skipping chatbot flow");

      } else if (subFlow.type === "3" && isCallAgent) {
        console.log("Adding job in call queue");
        await callQueue.add("call-job", { subFlow, leadId: id, email, phone, campaignId, companyId });
      } else if (subFlow.type === "4" && isWhatsappAgent && phone) {
        console.log("Adding job in whatsapp queue");
        const firstMessageNode = subFlow.flowData.filter((obj: any) => obj.data.isFirst === true)[0];
        const { phoneNumberId } = await getWABAIDAndToken(userId) || {};

        const jobId = `${new Date().getTime()}_whatsapp_${id}`;
        await whatsappQueue.add("whatsapp-job", { flowData: subFlow.flowData, flowId: subFlow.id, leadId: id, phone, campaignId, companyId, nodeId: firstMessageNode.id, message: firstMessageNode.data, userId, botName: "", botDescription: "", phoneNumberId }, { jobId });

        //adding in jobs
        await addJob(jobId, companyId, userId, subFlow.id, campaignId, id as string, "whatsapp");

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
