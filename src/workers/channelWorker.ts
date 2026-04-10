import { Worker } from "bullmq";
import IORedis from "ioredis";
import axios from "axios";
import { checkQuota,incrementQuota } from "../utils/redisUtil";
import { getCampaignStatus } from "../utils/redisUtil";
import {createChat} from "../models/chats";
import {sendTemplateMessageFromMeta} from "../utils/meta";
// import { sendGmailEmail } from "../utils/googleUtil";
import { sendMessageToAgent } from "../utils/eventManager";
import { sendEmail, getSMTPHost } from "../utils/emailUtil";
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
    port:6379,  
    maxRetriesPerRequest: null 
});

//WORKERS
const emailWorker=new Worker('email-queue',async(job :any)=>{
    const {campaignId,companyId,leadId,email,subject,body,userId,flowId,nodeId,flowData,userEmailData,attachments}=job.data;
    if(!(await checkQuota('email'))){
        console.log(`Email limit reached for today. Skipping: ${job.data.email}`);
        return;
    }
    if (!campaignId) {
        console.warn(`Job ${job.id} has no campaignId, skipping status check`);
    }


    const status=await getCampaignStatus(campaignId);
    if(status==='paused'){
        console.log(`Campaign ${campaignId} is paused skipping job`);
        return job.moveToDelayed(Date.now() + 1000 * 60 * 10); //recheck in 10 mins
    }

    if(status==='cancelled'){
        console.log(`Campaign ${campaignId} has been cancelled. Removing job`);
        await job.remove();  
        return;
    }

    console.log("sending email to : ",job.data.email);    
    const signature = "\n" + (userEmailData.signature ?? "");
    // const {messageId,threadId}=await sendGmailEmail(userId,{to:email,from:userEmail.userEmail,subject,body,isHtml:true,signature})
    const smtpHost = getSMTPHost(userEmailData.type, userEmailData.host);
    const {isSent,messageId}=await sendEmail({userEmail:userEmailData.email,userPassword:userEmailData.password,from:userEmailData.email,host:smtpHost,subject,body:body+signature,to:email,attachments});

    if(!isSent){
        await updateJobStatus(job.id,"failed",messageId);
        throw new Error(`Could not sent mail to ${email} : ${messageId}`);
    }    
    console.log("email sent to : ",job.data.email);
    await incrementQuota('email');
    
    //checking if chat exists
    const chatId=await isEmailChatPresent(userId,leadId,companyId,flowId);
    if(!chatId){ //creating new chat
          const data={
        _id:Math.floor(10000000 + Math.random() * 90000000).toString(),
        campaignId,
        companyId,
        flowId,
        flowData:JSON.stringify(flowData),
        emailAuth:JSON.stringify(userEmailData),
        userId:leadId,
        adminId:userId,
        agentId:userEmailData.id,
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
    // const {campaignId,companyId,leadId,phone,flowData,flowId,nodeId,message,userId,botName,botDescription,phoneNumberId}=job.data
    const {
      campaignId, companyId, leadId, phone,
      flowData, flowId, nodeId,
      message,          // raw job data / node data blob (kept for chat creation)
      resolvedMessage,
      varMap,   
      userId, botName, botDescription, phoneNumberId,
    } = job.data;
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
        await job.remove(); 
        return;
    }
    
    console.log(`Sending whatsapp message to : ${phone}`);

    // Use resolvedMessage when available (new path), fall back to raw message
    // so existing enqueued jobs (old format) still work.
    const textToSend: string =
      typeof resolvedMessage === "string" && resolvedMessage
        ? resolvedMessage
        : typeof message === "string"
        ? message
        : message?.message ?? "";

    // await sendTemplateMessageFromMeta(userId,phone,message);
    await sendTemplateMessageFromMeta(userId, phone, { ...message, varMap });
    await incrementQuota('whatsapp');

    //updating in mongodb
      const data = {
            _id: Math.floor(10000000 + Math.random() * 90000000).toString(),  
            campaignId,                  
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
            // messages: [{isBot:true,flowNodeId:nodeId,message,createdOn:Math.floor(Date.now() / 1000)}],
            messages: [
              {
                isBot:       true,
                flowNodeId:  nodeId,
                message:     textToSend,
                createdOn:   Math.floor(Date.now() / 1000),
              },
            ],
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


// const callWorker=new Worker('call-queue',async(job : any)=>{

//     const {campaignId,companyId,leadId}=job.data
//     if(!(await checkQuota('call'))){

//         console.log(`Call limit reached for today. Skipping : ${job.data.phone}`);
//         return;
//     }

//     const status=await getCampaignStatus(job.data.campaignId);

//     if(status==='paused'){

//         console.log(`Campaign ${job.data.campaignId} is paused skipping job`);
//         return job.moveToDelayed(Date.now() + 1000 * 60 * 10); //recheck in 10 mins
//     }

//     if(status==='cancelled'){
//         console.log(`Campaign ${job.data.campaignId} has been cancelled. Removing job`);
//         await job.remove();  
//         return;
//     }
    
//     await new Promise(resolve => setTimeout(resolve, 15000));
    
//     console.log(`Calling : ${job.data.phone}`);
//     await incrementQuota('call');

//     //updating in mongo db
//     const data={
//         campaignId,userId:leadId,
//         channel:'call',isBot:true,
//         flowId:"test",companyId,
//         message:"test",flowNodeId:'1'
//     };
//     // await createOrUpdateChat(data);
   
// },{connection,concurrency:1,limiter: { max: 1, duration: 1000 }});

// ─── CALL WORKER ──────────────────────────────────────────────────────────────

/**
 * Initiates an outbound AI call via the Python/Acefone call server.
 *
 * Environment variables:
 *   CALL_SERVER_URL   – base URL of the Python call server (default: http://localhost:8000)
 *   CALL_TYPE         – calltype value the Python utility expects   (default: "campaign")
 *
 * After the call is placed the worker creates a MongoDB Chat document so
 * agents can see call activity in the chats UI. The document is created
 * immediately; call_end details (duration, recording, etc.) can be appended
 * later via the /call-ended webhook (see callRoutes / callController).
 */
const callWorker = new Worker("call-queue", async (job: any) => {
  const {
    subFlow, leadId, email, phone, name,
    campaignId, companyId, userId,
    flowId, nodeId, script, title,
    campaignName  = "",
    aiName        = "AI Assistant",
    dynamicFields = {},
  } = job.data;

  if (!(await checkQuota("call"))) {
    console.log(`Call limit reached. Skipping: ${phone}`);
    return;
  }

  const status = await getCampaignStatus(campaignId);
  if (status === "paused") {
    console.log(`Campaign ${campaignId} paused — delaying call job`);
    return job.moveToDelayed(Date.now() + 1000 * 60 * 10);
  }
  if (status === "cancelled") {
    console.log(`Campaign ${campaignId} cancelled — removing call job`);
    await job.remove();
    return;
  }

  console.log(`Initiating call → ${phone} | campaign: ${campaignName} | node: ${nodeId}`);

  const CALL_SERVER_URL = process.env.CALL_SERVER_URL || "https://4fbb-122-161-52-81.ngrok-free.app";
  const CALL_TYPE       = process.env.CALL_TYPE       || "campaign";

  let callTaskId: string | null = null;
  try {
    const callResponse = await axios.post(
      `${CALL_SERVER_URL}/make-call`,
      {
        number:       phone,
        calltype:     CALL_TYPE,
        name:         name || phone,
        campaignName,
        campaignId,
        adminId:      userId,
        ai_name:      aiName,
        dynamicFields,
        node_script:  script,
        node_title:   title,
        leadId,
        nodeId,
        flowId,
        userId,
        companyId,
      },
      { timeout: 15_000 }
    );
    callTaskId = callResponse.data?.task_id ?? null;
    console.log(`Call queued — task_id: ${callTaskId}`);
  } catch (err: any) {
    const msg = err?.response?.data?.error ?? err.message;
    await updateJobStatus(job.id, "failed", msg);
    throw new Error(`Call server error for ${phone}: ${msg}`);
  }

  await incrementQuota("call");

  // Create MongoDB chat document
  const rawFlowData = subFlow?.flowData
    ? JSON.stringify(subFlow.flowData)
    : JSON.stringify(subFlow?.json ?? []);

  const chatDoc: any = {
    _id:               Math.floor(10_000_000 + Math.random() * 90_000_000).toString(),
    campaignId,
    companyId,
    userId:            leadId,
    adminId:           userId,
    userPhone:         phone,
    flowId,
    flowData:          rawFlowData,
    botRole:           aiName || title || "Call Agent",
    currentFlowNodeId: nodeId,
    intents:           {},
    isAgentHandover:   false,
    isCompleted:       false,
    isDeleted:         false,
    sentiment:         "proceed",
    channel:           "call",
    callTaskId,
    messages: [{
      isBot:      true,
      flowNodeId: nodeId,
      message:    title || script,
      createdOn:  Math.floor(Date.now() / 1000),
    }],
    createdOn: Math.floor(Date.now() / 1000),
  };

  await createChat(chatDoc);

  sendMessageToAgent(companyId, {
    type: "chatAdded",
    chat: {
      ...chatDoc,
      flowData:     [],
      userDetails:  { name: name || "Call Lead", email: email || "NA" },
      unseenMessages: 0,
    },
  });

  console.log(`Call chat created: ${chatDoc._id}`);
}, { connection, concurrency: 1, limiter: { max: 1, duration: 1000 } });


//WORKER EVENTS
emailWorker.on('completed',async (job : any)=>{

    console.log(`Email Job with ID ${job.id} has been completed`);

    //updatin status
    await updateJobStatus(job.id as string,"completed");
});


// emailWorker.on('failed',async(job:any,err:any)=>{

//     if (!job) {
//         console.error("Job is undefined");
//         return;
//       }
//     console.log(`Email Job with ID ${job.id} has failed : ${err}`);

//     //updatin status
//     await updateJobStatus(job.id as string,"failed");
// });

emailWorker.on('failed', async (job: any, err: any) => {
  if (!job) {
    console.error("Job is undefined");
    return;
  }
  const maxAttempts = job.opts?.attempts ?? 5;
  console.log(`Email Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${err}`);
  if (job.attemptsMade >= maxAttempts) {
    // All retries exhausted — mark failed and remove from queue
    await updateJobStatus(job.id as string, "failed");
    try {
      await job.remove();
      console.log(`Email Job ${job.id} removed after ${maxAttempts} failed attempts`);
    } catch (removeErr) {
      console.error(`Could not remove email job ${job.id}:`, removeErr);
    }
  }
  // else: BullMQ will retry automatically
});

whatsappWorker.on('completed',async (job:any)=>{
    console.log(`Whatsapp Job with ID ${job.id} has been completed`);

    //updatin status
    await updateJobStatus(job.id as string,"completed");
});


// whatsappWorker.on('failed',async(job:any,err:any)=>{

//     if (!job) {
//         console.error("Job is undefined");
//         return;
//       }
//     console.log(`Whatsapp Job with ID ${job.id} has failed : ${err}`);
//     //updatin status
//     await updateJobStatus(job.id as string,"failed");
// });

whatsappWorker.on('failed', async (job: any, err: any) => {
  if (!job) {
    console.error("Job is undefined");
    return;
  }
  const maxAttempts = job.opts?.attempts ?? 5;
  console.log(`WhatsApp Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${err}`);
  if (job.attemptsMade >= maxAttempts) {
    await updateJobStatus(job.id as string, "failed");
    try {
      await job.remove();
      console.log(`WhatsApp Job ${job.id} removed after ${maxAttempts} failed attempts`);
    } catch (removeErr) {
      console.error(`Could not remove whatsapp job ${job.id}:`, removeErr);
    }
  }
});


callWorker.on('completed',async (job:any)=>{

    console.log(`Call Job with ID ${job.id} has been completed`);

    //updatin status
    await updateJobStatus(job.id as string,"completed");
});


// callWorker.on('failed',async(job : any,err:any)=>{

//     if (!job) {
//         console.error("Job is undefined");
//         return;
//       }
//     console.log(`Call Job with ID ${job.id} has failed : ${err}`);
//     //updatin status
//     await updateJobStatus(job.id as string,"failed");
// });

callWorker.on('failed', async (job: any, err: any) => {
  if (!job) {
    console.error("Job is undefined");
    return;
  }
  const maxAttempts = job.opts?.attempts ?? 5;
  console.log(`Call Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${err}`);
  if (job.attemptsMade >= maxAttempts) {
    await updateJobStatus(job.id as string, "failed");
    try {
      await job.remove();
      console.log(`Call Job ${job.id} removed after ${maxAttempts} failed attempts`);
    } catch (removeErr) {
      console.error(`Could not remove call job ${job.id}:`, removeErr);
    }
  }
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
