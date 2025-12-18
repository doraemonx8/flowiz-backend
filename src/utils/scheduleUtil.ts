import { getJobIdsToRemove } from "../models/jobModel";
import { FlowData} from "../types/flow.type";
import { deleteEmailJobs } from "./emailUtil";

type ScheduleMessagesParams = {
  currentNodeId: string | number;
  flowData: FlowData;
};

type Channel = "email" | "web" | "whatsapp" | "call";

type ScheduledJob = {
  subject: string;
  body: string;
  delay: {
    hourDelay: number;
    minDelay: number;
    secDelay: number;
  };
};

// returns an array of jobs with delay
const scheduleMessages = async ({ currentNodeId, flowData }: ScheduleMessagesParams,_channel: Channel): Promise<ScheduledJob[]> => {

  const currentNode = flowData.find(node => node.id === currentNodeId);
  if (!currentNode) return [];

  const jobs: ScheduledJob[] = [];

  for (const nextNodeId of currentNode.next) {
    const nextNode = flowData.find(node => node.id === nextNodeId);
    if (!nextNode || nextNode.type !== "followUp") continue;

    let hourDelay = 0;
    let minDelay = 0;
    let secDelay = 0;

    for (const item of nextNode.data) {
      if (item.type === "delay") {
        hourDelay += Number(item.hours) || 0;
        minDelay += Number(item.mins) || 0;
        secDelay += Number(item.sec) || 0;
        continue;
      }

      jobs.push({
        subject: item.subject,
        body: item.body,
        delay: {
          hourDelay,
          minDelay,
          secDelay
        }
      });
    }
  }

  return jobs;
};


type removeJobsParams = {
    companyId:string;
    userId : string;
    flowId : string;
    leadId : string;
}


const removeScheduledJobs = async ({userId,flowId,companyId,leadId} : removeJobsParams) : Promise<boolean>=>{


    const jobs = await getJobIdsToRemove(companyId,userId,flowId,leadId);
    if(!jobs) return true;

    return await deleteEmailJobs(jobs);

}


export {scheduleMessages,removeScheduledJobs};
