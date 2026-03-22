import nodemailer from 'nodemailer';
import {updateEmailData } from '../models/emailModel';
import { inboxQueue, emailQueue } from '../queues/campaignQueue';
import inboxWorker from '../workers/inboxWorker';

import validate from 'deep-email-validator';
import { QuotaEngine } from './quotaEngine';
const temp_inbox_worker=inboxWorker;

interface SendEmailInterface{
  host:string;
  userEmail:string;
  userPassword:string;
  from:string;
  to:string;
  subject:string;
  body:string;
}

// Standard SMTP host mapping for common email providers
const SMTP_HOST_MAP: Record<string, string> = {
  "gmail": "smtp.gmail.com",
  "outlook": "smtp.office365.com",
  "zoho": "smtp.zoho.in",
  // "zoho_pro": "smtppro.zoho.in"
};

/**
 * Get SMTP host for email type
 * @param type - Email provider type ('gmail', 'outlook', 'zoho', or 'custom')
 * @param customHost - Host address when type is 'custom' (required if type === 'custom')
 * @returns SMTP host address
 */
const getSMTPHost = (type: string, customHost?: string): string => {
  if (type === 'custom') {
    if (!customHost) {
      throw new Error("Custom host is required when type is 'custom'");
    }
    return customHost;
  }
  return SMTP_HOST_MAP[type] || SMTP_HOST_MAP['gmail']; // default to gmail if unknown
};

// IMAP host map for common providers
const IMAP_HOST_MAP: Record<string, string> = {
  "gmail": "imap.gmail.com",
  "outlook": "imap.office365.com",
  "zoho": "imap.zoho.in"
  // "zoho_pro": "imappro.zoho.in"
};

/**
 * Resolve IMAP host from SMTP host string.
 * Accepts either a provider type (e.g. 'gmail') or an SMTP host (e.g. 'smtp.gmail.com') and returns the corresponding IMAP host.
 */
const getIMAPHost = (smtpOrType: string | undefined): string => {
  if (!smtpOrType) {
    throw new Error('Host or type is required to resolve IMAP host');
  }
  // If caller provided a provider type (e.g. 'gmail')
  if (!smtpOrType.includes('.')) {
    if (smtpOrType === 'custom') {
      throw new Error("Custom type requires an explicit host; cannot derive IMAP host");
    }
    return IMAP_HOST_MAP[smtpOrType] || IMAP_HOST_MAP['gmail'];
  }
  // smtpOrType looks like a host (e.g. smtp.gmail.com) — try to map back to provider
  for (const [type, smtp] of Object.entries(SMTP_HOST_MAP)) {
    if (smtp === smtpOrType) return IMAP_HOST_MAP[type];
  }
  // Fallback: attempt a naive replacement of smtp. -> imap.
  return smtpOrType.replace(/^smtp\./i, 'imap.');
};


const sendEmail=async(params:SendEmailInterface)=> {
   try{
    const transporter = nodemailer.createTransport({
        host:params.host, 
        port: 587,
        secure: false, 
        auth: {
          user: params.userEmail, 
          pass: params.userPassword 
        },
      });
      const mailOptions = {from:params.from,to:params.to,subject:params.subject,html:params.body.replaceAll("\n","<br>")};
      const info = await transporter.sendMail(mailOptions);
      console.log('Message sent: %s', info.messageId);
      return {isSent:true,messageId:info.messageId};
   }catch(err : any){
    console.error("an error occured while sending email : ",err);
    return {isSent:false,messageId:err.message};
   } 
  
}


const sendEmailReply=async(params:Record<string,any>)=>{
  try{
    const transporter = nodemailer.createTransport({
        host:params.host, 
        port: 587,
        secure: false, 
        auth: {
          user: params.userEmail, 
          pass: params.userPassword 
        },
    });

    const mailOptions = {
      from:params.from,to:params.to,
      subject:params.subject,html:params.body,
      inReplyTo:params.lastMessageId,
      references:params.references
    };
    
    const info=await transporter.sendMail(mailOptions);
    console.log("Reply sent : %s",info.messageId);
    return info.messageId;
  }catch(err){

    console.error(err);
    return null;
  }
}



const verifyEmail=async(params:SendEmailInterface,userId:string)=>{
  try{
    const {isSent,messageId}=await sendEmail(params);
    //updating status in DB
    if(isSent){
      const curr=new Date();
      const numberToMonth=["Jan","Feb","Mar","Apr","May","Jun","July","Aug","Sep","Oct","Nov","Dec"];
      const date=`${curr.getDate()}-${numberToMonth[curr.getMonth()]}-${curr.getFullYear()}`;
      await updateEmailData({status:"1",history:date},userId,params.userEmail);

      //once verified then start watching inbox // need to check since this should be done post campaign start
      await inboxQueue.add('inbox-job',
        {
          email: params.userEmail,
          userId,
          password: params.userPassword,
          host: params.host
        },
        {
          removeOnComplete: true,
          removeOnFail: 5,
          repeat: {
            every: 60 * 60 * 1000,
            key: `inbox-read-scheduler_${params.userEmail}` 
          }
        }
      );
      // Deduct quota after email is verified/sent
      await QuotaEngine.deductUsage({userId: parseInt(userId),featureSlug: 'email_accounts', amount: 1, source: 'consumption', description: `Added email account: ${params.userEmail}`});

    }else{
      await updateEmailData({status:"2"},userId,params.userEmail);
    }
    return true;
  }catch(err){

    console.error(err);
    return false;
  }

}

/**
 * Enqueue a one-off inbox job to test IMAP flow via BullMQ queue + worker.
 * This mimics the payload shape used in verifyEmail/inboxWorker but without repeat options.
 */
const enqueueInboxTestJob = async (params: {email: string; password: string; type?: string; host?: string; userId: string | number;}) => {
  const { email, password, type, host, userId } = params;
  let hostForWorker: string;
  if (type && type !== 'custom') {
    hostForWorker = type;
  } else if (host) {
    hostForWorker = host;
  } else {
    throw new Error("Either type or host must be provided");
  }
  const job = await inboxQueue.add('inbox-job', {email,userId,password,host: hostForWorker});
  return { jobId: job.id, email, host: hostForWorker};
}

const deleteInboxJobs=async(email:string)=>{
  try{
    const key=`inbox-read-scheduler_${email}`;
    const isRemoved=await inboxQueue.removeJobScheduler(key);
    if (isRemoved) {
            console.log(`Successfully removed repeatable job schedule for email: ${email} (Key: ${key})`);
            return true;
        } else {
            console.warn(`Repeatable job schedule for email: ${email} (Key: ${key}) not found.`);
            return false;
        }
  }catch(err){
    console.error(err);
    return false;
  }
}


const deleteEmailJobs=async(jobIds:Array<string>)=>{
  try{
      for (const jobId of jobIds) {
        // Get the job instance from BullMQ
        const bullMqJob = await emailQueue.getJob(jobId);

        if (bullMqJob) {
            const currentState = await bullMqJob.getState();

            await bullMqJob.remove();
            console.log(`Successfully removed BullMQ job: ${jobId} (was in state: ${currentState})`);
            // if (['waiting', 'active', 'delayed', 'paused', 'failed'].includes(currentState)) {
                
            // } else {
            //     console.log(`BullMQ job ${jobId} is in terminal state (${currentState}). Not removing.`);
            // }
        } else {
            console.warn(`BullMQ job ${jobId} not found in queue. It might have already completed or been auto-removed.`);
        }
    }
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}



const addUtmSource=(data:any)=> {
  return {
    ...data,
    signature: data.signature.replace(/href="([^"]+)"/, (_match: any, url: string | string[]) => {
      const separator = url.includes("?") ? "&" : "?";
      return `href="${url}${separator}utm_source=email"`;
    })
  };
}


const verifyEmailAddress=async(email:string) : Promise<boolean>=>{
  try{
    const res=await validate(email);
    return res.valid;
  }catch(err){
    return false;
  }

}


export {sendEmail,verifyEmail,deleteInboxJobs,sendEmailReply,deleteEmailJobs,addUtmSource,verifyEmailAddress,getSMTPHost,SMTP_HOST_MAP,getIMAPHost,IMAP_HOST_MAP,enqueueInboxTestJob};
