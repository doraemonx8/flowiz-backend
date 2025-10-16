import nodemailer from 'nodemailer';
import {updateEmailData } from '../models/emailModel';
import { inboxQueue, emailQueue } from '../queues/campaignQueue';
import inboxWorker from '../workers/inboxWorker';

import validate from 'deep-email-validator';
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

      //once verified then start watching inbox

            await inboxQueue.add(
              'inbox-job',
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
                  key: `inbox-read-scheduler:${params.userEmail}` 
                }
              }
            );

    }else{

      await updateEmailData({status:"2"},userId,params.userEmail);
    }

    return true;
  }catch(err){

    console.error(err);
    return false;
  }

}

const deleteInboxJobs=async(email:string)=>{

  try{

    const key=`inbox-read-scheduler:${email}`;

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


export {sendEmail,verifyEmail,deleteInboxJobs,sendEmailReply,deleteEmailJobs,addUtmSource,verifyEmailAddress};
