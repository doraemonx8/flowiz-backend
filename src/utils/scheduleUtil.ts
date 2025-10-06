import { getJobIdsToRemove } from "../models/jobModel";
import { getChatDetails, getCurrentFlowData } from "./botMongo";
import { createJobsFromFlow } from "./channelWorkerUtil";


const scheduleMessages=async(params : any,type:string)=>{

    // try{

    //     const prevNodeId=params.currentNodeId;
    //     const {flowData,currentFlowNodeId,isCompleted,isAgentHandover}=await getCurrentFlowData(params.chatId);

    //     const chatData=await getChatDetails(params.chatId);
    //     const campaignId=await 
    //     //checking if any prev jobs for prev node exists;delete them
    //     // const pendingEmailJobs =await getJobIdsToRemove(chatData.companyId,chatData.adminId,chatData.flowId,chatData.userId);

    //     //removing these jobs
    //     // await deleteEmailJobs(pendingEmailJobs as Array<string>);
    //     if(isCompleted==true || isAgentHandover==true){
    //         return true;
    //     }


    //     const nodeData=flowData.filter((node : any) => node.id === currentFlowNodeId)[0];

    //     const scheduledFlow=nodeData?.scheduleData || null;

    //     if (Boolean(scheduledFlow)){

    //         //getting scheduled messages
    //         const jobs = createJobsFromFlow(scheduledFlow);

    //         //adding in queue
    //         if(type==="email"){


                
    //             for(const job of jobs){
    //                const payload = { subject: job.subject, body: job.body, leadId: chatData.userId,flowId:params.flowId, email, phone, campaignId, companyId,userId,nodeId:job.id,flowData:subFlow.flowData || subFlow.json,userEmailData:userEmail };
          
    //                 if (!emailData.delay) {

    //                 //adding in jobs
    //                 const jobId=`${new Date().getTime()}_email_${id}`;
    //                 await addJob(jobId as string,companyId,userId,subFlow.id,campaignId,id as string,"email");
    //                 await emailQueue.add("email-job", payload,{jobId,delay:(leadCount-1) * 1000*120}); //default 2min delay for each mail

                    
    //                 }
    //             }
                
    //         }
          
    //     }
        
        
    // }catch(err){


    // }
}

export default scheduleMessages;