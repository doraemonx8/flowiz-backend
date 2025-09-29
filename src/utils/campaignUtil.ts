import { campaignQueue,emailQueue,whatsappQueue,callQueue } from "../queues/campaignQueue";
import { updateCampaignStatusDB } from "../models/campaignModel";
import { updateCampaignStatus } from "./redisUtil";
import { Job } from "bullmq";
import { removeAllJobsFromCampaign } from "../models/jobModel";


interface CampaignData {
  scheduledAt: string;
  [key: string]: any; // Allow other properties
}

interface CampaignProgress {
  emailProgress: number;
  callProgress: number;
  whatsappProgress: number;
  overallProgress: number;
}

interface StatusResponse {
  status: boolean;
  message: string;
}

// Schedule campaign
const scheduleCampaignUtil = async (data: CampaignData): Promise<StatusResponse> => {
  try {

    const scheduledAtUTC = new Date(data.scheduledAt);
    const nowUTC = new Date();

    // Calculate delay
    // const delay = scheduledAtUTC.getTime() - nowUTC.getTime();


    if (data.delay <= 0) {
      console.log("scheduling campaign now");

      await campaignQueue.add("campaign-job", data);

      return { status: true, message: "Campaign scheduled" };
    }


    //updating campaign status
    await updateCampaignStatusDB(data.campaignId,'pending');
    await updateCampaignStatus(data.campaignId,'pending');

    await campaignQueue.add("campaign-job", data, { delay : data.delay });

    console.log(`campaign schedulled with delay : ${data.delay}`);
    return { status: true, message: "Campaign scheduled" };
  } catch (err) {
    console.error(`An error occurred while scheduling the campaign: ${err}`);
    return { status: false, message: "Cannot schedule campaign. Try again later" };
  }
};


const getCampaignQueueStatus=async()=>{

  try {
    const jobCounts = await campaignQueue.getJobCounts();
    console.log('Job counts:', jobCounts); 

    const waitingJobs = await campaignQueue.getJobs(['waiting', 'delayed'], 0, 50); // get first 50 jobs
   

    return {
      jobCounts,
      waitingJobs
    };
  } catch (error) {
    console.error('Error fetching queue status:', error);
    throw error;
  }
}


const deleteCampaignJobs=async(campaignId:string)=>{

  try{

    const jobIds=await removeAllJobsFromCampaign(campaignId);


    const queues=[campaignQueue,emailQueue,callQueue,whatsappQueue];

    for (const queue of queues) {
      for (const jobId of jobIds) {
        const job = await queue.getJob(jobId);
        if (job) {
          try {
            await job.remove();
          } catch (err) {
            console.error(`Error removing job ${jobId} from ${queue.name}:`, err);
          }
        }
      }
    }

    console.log(`Removed ${jobIds.length} jobs for campaign ${campaignId}`);
    return true;

  }catch(err){
    console.error(err);
    return false;
  }
}

export { scheduleCampaignUtil ,getCampaignQueueStatus,deleteCampaignJobs};
