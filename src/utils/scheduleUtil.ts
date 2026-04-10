import { getJobIdsToRemove } from "../models/jobModel";
import { FlowData} from "../types/flow.type";
import { deleteEmailJobs } from "./emailUtil";

type ScheduleMessagesParams = {
  currentNodeId: string | number;
  flowData: FlowData;
};

type Channel = "email" | "web" | "whatsapp" | "call";

type ScheduledJob = {
  subject?: string;
  body?: string;
  message?:string;
  template?:string;
  templateFile?:string;
  attachments?: any[];
  title?:string;  
  script?:string;
  variableValues?:Record<string,string>
  delay: {
    hourDelay: number;
    minDelay: number;
    secDelay: number;
  };
};

// returns an array of jobs with delay
const scheduleMessages = ({ currentNodeId, flowData }: ScheduleMessagesParams,channel: Channel): ScheduledJob[] => {

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

      //-----------Delay-----------
      if (item.type === "delay") {
        hourDelay += Number(item.hours) || 0;
        minDelay += Number(item.mins) || 0;
        secDelay += Number(item.sec) || 0;
        continue;
      }

      const job: ScheduledJob={delay : {hourDelay,minDelay,secDelay}};


      if(channel === "email" && item.type==="email"){

        job.subject=item.subject;
        job.body=item.body;
        jobs.push(job);
        continue;

      }
      
      
      if(channel === "whatsapp" && (item.type==="template" || item.type==="text")){


        job.variableValues = item.variableValues;

        if (item.type === "template") {
          job.template = item.template;
          job.templateFile = item.templateFile;
        } else {
          job.message = item.message;
        }

        jobs.push(job);
        }

      if (channel === "call" && (item as any).type === "call") {
        (job as any).title  = (item as any).title  ?? "";
        (job as any).script = (item as any).script ?? "";
        jobs.push(job);
        continue;
      }

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
