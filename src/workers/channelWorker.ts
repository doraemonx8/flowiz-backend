import { Worker } from "bullmq";
import IORedis from "ioredis";
import { checkQuota,incrementQuota } from "../utils/redisUtil";
import { getCampaignStatus } from "../utils/redisUtil";
import {createChat} from "../models/chats";
import {sendTemplateMessageFromMeta} from "../utils/meta";
// import { sendGmailEmail } from "../utils/googleUtil";
import { sendMessageToAgent } from "../utils/eventManager";
import { sendEmail } from "../utils/emailUtil";
import { isEmailChatPresent, addMailMessage } from "../models/emailModel";
import { updateJobStatus } from "../models/jobModel";

interface UserEmailDetails {
    userEmail: string;
    type:string | number
    configData : string
    password:string
  }


const connection = new IORedis({ 
    host:'127.0.0.1',
    port:6381,  
    maxRetriesPerRequest: null 
});

const typeToHostMap : any={
    "gmail":"smtp.gmail.com",
    "outlook":"smtp.office365.com",
    "zoho":"smtp.zoho.in"
}

//WORKERS
const emailWorker=new Worker('email-queue',async(job :any)=>{
    const {campaignId,companyId,leadId,email,subject,body,userId,flowId,nodeId,flowData,userEmailData}=job.data;
    if(!(await checkQuota('email'))){
        console.log(`Email limit reached for today. Skipping: ${job.data.email}`);
        return;
    }

    const status=await getCampaignStatus(campaignId);
    if(status==='paused'){
        console.log(`Campaign ${campaignId} is paused skipping job`);
        return job.moveToDelayed(Date.now() + 1000 * 60 * 10); //recheck in 10 mins
    }

    if(status==='cancelled'){
        console.log(`Campaign ${campaignId} has been cancelled. Removing job`);
        return job.remove();
    }

    console.log("sending email to : ",job.data.email);    
    const signature="\n" + userEmailData.signature;
    // const {messageId,threadId}=await sendGmailEmail(userId,{to:email,from:userEmail.userEmail,subject,body,isHtml:true,signature})
    const {isSent,messageId}=await sendEmail({userEmail:userEmailData.email,userPassword:userEmailData.password,from:userEmailData.email,host:typeToHostMap[userEmailData.type],subject,body:body+signature,to:email});

    if(!isSent){
        await updateJobStatus(job.id,"failed",messageId);
        throw new Error(`Could not sent mail to ${email} : ${messageId}`);
    }    
    console.log("email sent to : ",job.data.email);
    // await incrementQuota('email');
    
    //checking if chat exists
    const chatId=await isEmailChatPresent(userId,leadId,companyId,flowId);

    if(!chatId){ //creating new chat
          const data={
        _id:Math.floor(10000000 + Math.random() * 90000000).toString(),
        companyId,
        flowId,
        flowData:JSON.stringify(flowData),
        // threadId,
        userId:leadId,
        adminId:userId,
        adminMail:userEmailData.userEmail,
        channel:'email',
        currentFlowNodeId:nodeId,
        intents:{},
        isAgentHandover:false,
        isCompleted:false,
        isDeleted:false,
        sentiment:"NA",
        messages:[{
            message:body + `\n${signature}`,
            subject,
            isBot:true,
            createdOn: new Date().getTime() ,
            flowNodeId:nodeId,
            messageId,
          
        }],
        createdOn:Math.floor(Date.now() / 1000),
        message:body,flowNodeId:nodeId
    };

    await createChat(data);
    sendMessageToAgent(companyId,{type:"chatAdded",
            chat:{
              ...data,
              userDetails:{name:"email user",email},
            }
    })

    }else{ //adding message in chat

        await addMailMessage(chatId as string,
            {
                isBot:true,isAgent:false,
                createdOn:new Date().getTime(),
                subject,
                message:body+signature,
                messageId
            }
        )
        sendMessageToAgent(companyId,{type:"messageAdded",data:{chatId,message:{
                isBot:true,isAgent:false,
                createdOn:new Date().getTime(),
                subject,
                message:body+signature,
                messageId
            }}
            
        })
    }
  

   
    
},{connection,concurrency:2, limiter: { max: 3, duration: 1000 }});



const whatsappWorker=new Worker('whatsapp-queue',async(job : any)=>{
    const {campaignId,companyId,leadId,phone,flowData,flowId,nodeId,message,userId,botName,botDescription,phoneNumberId}=job.data
    if(!(await checkQuota('whatsapp'))){
        console.log(`Whats app limit reached for today. Skipping : ${phone}`);
        return;
    }

    const status=await getCampaignStatus(campaignId);
    if(status==='paused'){
        console.log(`Campaign ${campaignId} is paused skipping job`);
        return job.moveToDelayed(Date.now() + 1000 * 60 * 10); //recheck in 10 mins
    }
    if(status==='cancelled'){
        console.log(`Campaign ${campaignId} has been cancelled. Removing job`);
        return job.remove();
    }
    
    console.log(`Sending whatsapp message to : ${phone}`);

    await sendTemplateMessageFromMeta(userId,phone,message);
    
    await incrementQuota('whatsapp');

    //updating in mongodb
      const data = {
            _id: Math.floor(10000000 + Math.random() * 90000000).toString(),                    
            companyId,       
            userId:leadId,
            adminId:userId,
            userPhone:phone,
            flowId,
            flowData : JSON.stringify(flowData),
            botRole : `${botName} - ${botDescription}`,
            currentFlowNodeId:nodeId,            
            intents: {},
            isAgentHandover: false,
            isCompleted: false,
            isDeleted: false,
            sentiment: 'proceed',
            channel:"whatsapp",
            phoneNumberId,
            messages: [{isBot:true,flowNodeId:nodeId,message,createdOn:Math.floor(Date.now() / 1000)}],
            createdOn: Math.floor(Date.now() / 1000),
        }
    const chatId=await createChat(data);

          //send event for new chat added
          sendMessageToAgent(companyId,{type:"chatAdded",
            chat:{
              _id:chatId,
              companyId,userId,
              flowId,flowData:[],
              userDetails:{name:"whatsapp user",email:"NA"},
              currentFlowNodeId : nodeId,
              isAgentHandover:false,
              isCompleted:false,
              isDeleted:false,
              sentiment:"proceed",
              channel:"whatsapp",
              messages:[],
              intents:{},
              createdOn:new Date().getTime(),
              unseenMessages:0
            }
          })

},{connection,concurrency:5,limiter: { max: 20, duration: 1000 }});


const callWorker=new Worker('call-queue',async(job : any)=>{

    const {campaignId,companyId,leadId}=job.data
    if(!(await checkQuota('call'))){

        console.log(`Call limit reached for today. Skipping : ${job.data.phone}`);
        return;
    }

    const status=await getCampaignStatus(job.data.campaignId);

    if(status==='paused'){

        console.log(`Campaign ${job.data.campaignId} is paused skipping job`);
        return job.moveToDelayed(Date.now() + 1000 * 60 * 10); //recheck in 10 mins
    }

    if(status==='cancelled'){

        console.log(`Campaign ${job.data.campaignId} has been cancelled. Removing job`);
        return job.remove();
    }
    
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    console.log(`Calling : ${job.data.phone}`);
    await incrementQuota('call');

    //updating in mongo db
    const data={
        campaignId,userId:leadId,
        channel:'call',isBot:true,
        flowId:"test",companyId,
        message:"test",flowNodeId:'1'
    };
    // await createOrUpdateChat(data);
   
},{connection,concurrency:1,limiter: { max: 1, duration: 1000 }});


//WORKER EVENTS
emailWorker.on('completed',async (job : any)=>{

    console.log(`Email Job with ID ${job.id} has been completed`);

    //updatin status
    await updateJobStatus(job.id as string,"completed");
});


emailWorker.on('failed',async(job:any,err:any)=>{

    if (!job) {
        console.error("Job is undefined");
        return;
      }
    console.log(`Email Job with ID ${job.id} has failed : ${err}`);

    //updatin status
    await updateJobStatus(job.id as string,"failed");
});

whatsappWorker.on('completed',async (job:any)=>{
    console.log(`Whatsapp Job with ID ${job.id} has been completed`);

    //updatin status
    await updateJobStatus(job.id as string,"completed");
});


whatsappWorker.on('failed',async(job:any,err:any)=>{

    if (!job) {
        console.error("Job is undefined");
        return;
      }
    console.log(`Whatsapp Job with ID ${job.id} has failed : ${err}`);
    //updatin status
    await updateJobStatus(job.id as string,"failed");
});


callWorker.on('completed',async (job:any)=>{

    console.log(`Call Job with ID ${job.id} has been completed`);

    //updatin status
    await updateJobStatus(job.id as string,"completed");
});


callWorker.on('failed',async(job : any,err:any)=>{

    if (!job) {
        console.error("Job is undefined");
        return;
      }
    console.log(`Call Job with ID ${job.id} has failed : ${err}`);
    //updatin status
    await updateJobStatus(job.id as string,"failed");
});


const shutdown = async () => {
    console.log("Shutting down workers...");
    await emailWorker.close();
    await whatsappWorker.close();
    await callWorker.close();
    process.exit(0);
  };
  
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);


export {emailWorker,callWorker,whatsappWorker};
