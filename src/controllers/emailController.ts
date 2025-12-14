import { Request, Response } from 'express';
import {getAllEmailsDB,deleteMailDB,insertEmail} from "../models/emailModel";
import {verifyEmail, deleteInboxJobs, getSMTPHost } from '../utils/emailUtil';
import { getCampaignProgress, updateCampaignStatusDB } from '../models/campaignModel';
import { decryptId, encryptId } from '../utils/encryptDecrypt';

interface EmailData{
    id:string;
    campaignId:string;
    name:string;
    email:string;
    password:string;
    status:string;
    type:string;
}
const getAllEmails=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {userId}=req.body;
        const emails : any = await getAllEmailsDB(userId);

        //checking the status of campaigns 
        for (const emailData of emails ){
            const campaignId=emailData?.campaignId;
            const campaignProgress=await getCampaignProgress(campaignId);
            // const decryptedPassword=decryptId(emailData.password);
            if(parseInt(campaignProgress as string) == 100){
                //update in DB
                await updateCampaignStatusDB(campaignId,"completed");
                emailData['isUsedInCampaign']=true;
                emailData['campaignStatus']='completed';
            }else if(parseInt(campaignProgress as string) == 0){
                emailData['isUsedInCampaign']=false;
                emailData['campaignStatus']='NA';
            }else{
                emailData['isUsedInCampaign']=true;
                emailData['campaignStatus']='pending';
            }
            delete emailData.campaignId;
            // emailData.password=decryptedPassword;
        }
        return res.status(200).send({status:true,data:emails});
    }catch(err){

        console.error("An error occured while getting all emails : ",err);
        return res.status(500).send({status:false,message:"Unable to get all emails"});
    }
}


const saveEmail=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {userId,email,type,password,subscriptionId,host}=req.body;
        // host is required only if type is 'custom'
        if(type === 'custom' && !host){
            return res.status(400).send({status:false,message:"Host is required for custom email type"});
        }
        
        const { status, message } = await insertEmail(userId, type, email, password, type === 'custom' ? host : undefined);
        if(status){
            const smtpHost = getSMTPHost(type, host);
            verifyEmail({host:smtpHost,userEmail:email,userPassword:password,from:email,to:"rahul.solanki@cybernauts.in",subject:"Email Activation",body:"Hey, Email sent before adding"},userId,subscriptionId);
        return res.status(status ? 200 : 400).send({ status, message });
        }
    }catch(err){
        console.error("An error occured while saving email");
        return res.status(500).send({status:false,message:"Could not save email"});
    }
}


const deleteEmail=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId}=req.body;

        const{email}=req.query;

        const isDeleted=await deleteMailDB(email as string,userId);

        if(!isDeleted){

            return res.status(400).send({status:false,message:"Not authorized to delete this email"});
        }

        await deleteInboxJobs(email as string);
        return res.status(200).send({status:true,message:"Email deleted"});
    }catch(err){

        console.error("An error occured while deleting mail : ",err);
        return res.status(500).send({status:false,message:"Unable to delete email"});
    }
}


const encryptPassword=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {password}=req.body;

        const encryptedPassword=encryptId(password);

        console.log("encrypted =>",encryptedPassword);

        return res.status(200).send({status:true,password:encryptedPassword});
    }catch(err){
        console.error("An error occured while encrypting password : ",err);

        return res.status(500).send({status:false,message:"some error occured"});
    }
}

export {getAllEmails,saveEmail,deleteEmail,encryptPassword};