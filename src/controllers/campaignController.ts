import { Request, Response } from 'express';
import {getCampaignIdBySlug,getCampaignTime,getAllCampaigns,deleteCampaignDB,editCampaignNameDB,updateCampaignStatusDB,setTemplateDB, getCampaignProgress,updateTimezone} from "../models/campaignModel";
import {getFlowIdBySlug} from "../models/flowModel";
import {scheduleCampaignUtil,getCampaignQueueStatus,deleteCampaignJobs} from "../utils/campaignUtil";
import {updateCampaignStatus} from "../utils/redisUtil";
import { getLeadConversionPerCampaign } from '../models/dashboardModel';
import {calculateTimezoneDelay} from "../utils/timezoneUtil";

import QuotaEngine from '../utils/quotaEngine';

const scheduleCampaign=async(req:Request,res:Response):Promise<any>=>{
    console.log("INSIDE SCHEDULE CAMPAIGN")
    try{
        const {isEmailAgent,isCallAgent,isWhatsappAgent,isWebAgent,subFlows,campaignData,template,campaignId,agents,scheduledAt,emailData,delay}=req.body;
        const user = (req as any).user;
        const userId = user.sub;
        if (isEmailAgent) {
            const emailQuota = await QuotaEngine.checkQuota(userId, 'email_agents');
            console.log("EMAIL QUOTA",emailQuota)
            if (!emailQuota.allowed) return res.status(429).send(QuotaEngine.formatQuotaError(emailQuota));
        }
        if (isCallAgent) {
            const callQuota = await QuotaEngine.checkQuota(userId, 'call_agents');
            if (!callQuota.allowed) return res.status(429).send(QuotaEngine.formatQuotaError(callQuota));
        }
        if (isWhatsappAgent) {
            const waQuota = await QuotaEngine.checkQuota(userId, 'whatsapp_agents');
            if (!waQuota.allowed) return res.status(429).send(QuotaEngine.formatQuotaError(waQuota));;
        }
        if (isWebAgent) {
            const webQuota = await QuotaEngine.checkQuota(userId, 'chatbot_agents');
            if (!webQuota.allowed) return res.status(429).send(QuotaEngine.formatQuotaError(webQuota));
        }

        if(template && template!=0){
            //saving template Data
            await setTemplateDB(userId,campaignId,template);
        }

        if(isWebAgent && agents.length==1){
            await QuotaEngine.deductUsage({userId,featureSlug: 'campaigns',amount: 1,source: 'consumption',description: `Scheduled web campaign: ${campaignId || campaignData[0]?.name || 'Unknown'}`});
            return res.status(200).send({status:true,message:"Campaign completed since web bot!!"});
        }
        
        const leads=JSON.parse(campaignData[0].leads);

        campaignData[0].subFlows=subFlows;
        campaignData[0].leads=leads;
        campaignData[0].scheduledAt=Number(scheduledAt);
        campaignData[0].userId=userId;
        campaignData[0].isEmailAgent=isEmailAgent;
        campaignData[0].isWebAgent=isWebAgent;
        campaignData[0].isCallAgent=isCallAgent;
        campaignData[0].isWhatsappAgent=isWhatsappAgent;
        campaignData[0].userEmailData=isEmailAgent ? emailData : [];
        campaignData[0].delay=delay;

        const schedulingQuota = await QuotaEngine.checkQuota(userId, 'scheduling');
        console.log("SCHEDULE QUOTA - ", schedulingQuota)
        if (!schedulingQuota.allowed) {
            console.log("SCHEDULING QUOTA ALLOWED -",schedulingQuota.allowed)
            return res.status(429).send(QuotaEngine.formatQuotaError(schedulingQuota));
        }

        const isScheduled=await scheduleCampaignUtil(campaignData[0]);

        if(!isScheduled.status){
            return res.status(400).send({status:false,message:isScheduled.message});
        }
        await QuotaEngine.deductUsage({ userId, featureSlug: 'scheduling', amount: 1, source: 'consumption', description: `Used scheduling for web campaign: ${campaignId || campaignData[0]?.name || 'Unknown'}` });
        await QuotaEngine.deductUsage({userId,featureSlug: 'campaigns',amount: 1,source: 'consumption',description: `Scheduled campaign: ${campaignId || campaignData[0].name || 'Unknown'}`});
        return res.status(200).send({status : true,data:campaignData[0],message:isScheduled.message});
    }catch(err){
        console.error(`An error occured while scheduling campaign : ${err}`);
        return res.status(500).send({status:false,message:"Could not shcedule campaign. Try again later"});
    }
}


const pauseCampaign=async(req:Request,res:Response):Promise<any>=>{

    try{

        const user = (req as any).user;
        const userId = user.sub;
        const {slug}=req.body;
        const campaigns = await getCampaignIdBySlug(slug, userId);

        const campaignId = campaigns?.[0]?.id;

        if (!campaignId) {
            return res.status(400).send({status:false,message:"No campaign found"})
        }

        const isPaused=await updateCampaignStatus(campaignId,'paused') && await updateCampaignStatusDB(campaignId,'paused');

        if(!isPaused){

            return res.status(400).send({status:true,message:"Could not pause campaign. Try again later"});
        }


        return res.status(200).send({status:true,message:"Campaign has been paused"});

    }catch(err){

        console.error(`An error occured while pausing campaign : ${err}`);
        return res.status(500).send({status:false,message:"Could not pause campaign. Try again later"});
    }
}


const resumeCampaign=async(req:Request,res:Response):Promise<any>=>{

    try{

        const user = (req as any).user;
        const userId = user.sub;
        const {slug}=req.body;
        const campaigns = await getCampaignIdBySlug(slug, userId);

        const campaignId = campaigns?.[0]?.id;

        if (!campaignId) {
            return res.status(400).send({status:false,message:"No campaign found"})
        }

        const isResumed=await updateCampaignStatus(campaignId,'running') && await updateCampaignStatusDB(campaignId,'cancelled');

        if(!isResumed){

            return res.status(400).send({status:true,message:"Could not resume campaign. Try again later"});
        }

        
        return res.status(200).send({status:true,message:"Campaign has been resumed"});

    }catch(err){

        console.error(`An error occured while resuming campaign : ${err}`);
        return res.status(500).send({status:false,message:"Could not resume campaign. Try again later"});
    }
}


const cancelCampaign=async(req:Request,res:Response):Promise<any>=>{

    try{

        // const {campaignId}=req.body;
        // slug
        const user = (req as any).user;
        const userId = user.sub;
        const {slug}=req.body;
        const campaigns = await getCampaignIdBySlug(slug, userId);

        const campaignId = campaigns?.[0]?.id;

        if (!campaignId) {
            return res.status(400).send({status:false,message:"No campaign found"})
        }

        const isCancelled=await updateCampaignStatus(campaignId,'cancelled') && await deleteCampaignJobs(campaignId);


        if(!isCancelled){

            return res.status(400).send({status:true,message:"Could not cancel campaign. Try again later"});
        }

        
        return res.status(200).send({status:true,message:"Campaign has been cancelled"});


    }catch(err){

        console.error(`An error occured while cancelling campaign : ${err}`);
        return res.status(500).send({status:false,message:"Could not cancel campaign. Try again later"});
    }
}


const getProgress=async(req:Request,res:Response):Promise<any>=>{

    try{

        const user = (req as any).user;
        const userId = user.sub;
        const {slug}=req.body;
        const campaigns = await getCampaignIdBySlug(slug, userId);
        const campaignId = campaigns?.[0]?.id;

        if(!campaignId){
            return res.status(400).send({status:false,message:"Campaign Id is required"});
        }

        const data=await getCampaignProgress(campaignId);
        return res.status(200).send({status : true,data:data});


    }catch(err){

        console.error(`An error occured while getting campaign progress : ${err}`);
        return res.status(500).send({status:false,message:"Could not shcedule campaign. Try again later"});
    }
}



const getCampaignStatus=async(req : Request, res:Response):Promise<any>=>{

    try{

        const data=await getCampaignQueueStatus();

        return res.status(200).send({status:true,data});
    }catch(err){
        console.error("An error occured while getting quueue status : ",err);
        return res.status(500).send({status:false,message:"Could not get status"});
    }
}




const getCampaignResult=async(req:Request,res:Response):Promise<any>=>{

    try{

        const user = (req as any).user;
        const userId = user.sub;
        const {slug}=req.body;

        // const {userId,companyId}=req.body;
        // const {slug}=req.query;

        const flowId=await getFlowIdBySlug(slug as string,userId);

       const scheduledAt = await getCampaignTime(slug as string, userId);

        if (!scheduledAt) {
        return res
            .status(404)
            .send({ status: false, message: "Campaign not scheduled" });
        }

        const pastDate = new Date(scheduledAt as string);
        const now = new Date();

        const diffMs = now.getTime() - pastDate.getTime();

        const seconds = Math.floor(diffMs / 1000) % 60;
        const minutes = Math.floor(diffMs / (1000 * 60)) % 60;
        const hours = Math.floor(diffMs / (1000 * 60 * 60)) % 24;
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        const {conversion,webCompletedChats,whatsAppCompletedChats,emailCompletedChats}=await getLeadConversionPerCampaign([flowId as string]);


        return res.status(200).send({status:true,data:{conversion,webCompletedChats,whatsAppCompletedChats,emailCompletedChats,time:{seconds,minutes,hours,days}}})
    }catch(err){

        console.error("An error occured while getting result : ",err);
        return res.status(500).send({status:false,message:"Could not get campaign result.Try again later"});
    }
}


const getCampaigns=async(req:Request,res:Response) : Promise<any>=>{
    try{
        // const {userId}=req.body;
        const user = (req as any).user;
        const userId = user.sub;
        const campaigns :any =await getAllCampaigns(userId);
        const data: any[]=[];
        if(!campaigns.length){
            return res.status(200).send({status:true,data});
        }
        for(const campaign of campaigns){
             const agents = [
                campaign.subFlowTypes && campaign.subFlowTypes.includes('1') ? "email" : "",
                campaign.subFlowTypes && campaign.subFlowTypes.includes('2') ? "web" : "",
                campaign.subFlowTypes && campaign.subFlowTypes.includes('3') ? "call" : "",
                campaign.subFlowTypes && campaign.subFlowTypes.includes('4') ? "whatsapp" : ""
            ].filter(Boolean);

            const source=JSON.parse(campaign.json).leads;
            delete(campaign.json);
            delete(campaign?.subFlowTypes);
            const status=campaign.status==='5' ? "draft" :campaign.status==="2" ? "running" : campaign.status==="3" ? "pause" :"cancelled"
            const progress=status!=="draft" ? await getCampaignProgress(campaign.campaignId) :"0";
            data.push({...campaign,agents,source,status,progress});
        }

        return res.status(200).send({status:true,data});
    }catch(err){

        console.error(err);
        return res.status(500).send({status:false,message:"Could not get campaigns."});
    }
}


const deleteCampaign=async(req:Request,res:Response):Promise<any>=>{

    try{

        const user = (req as any).user;
        const userId = user.sub;

        const campaignId = req.body.id as string;

        if (!campaignId) {
            return res.status(400).send({status:false,message:"No campaign found"})
        }

        const isDeleted=await deleteCampaignDB(userId,campaignId) && await deleteCampaignJobs(campaignId);

        if(!isDeleted){
            return res.status(400).send({status:false,message:"Could not delete"});
        }

        return res.status(200).send({status:true,message:"Deleted"});

    }catch(err){
        console.error("An error occured : ",err);

        return res.status(500).send({status:false,message:"Cannot delete campaign. Try again"});
    }
}


const editCampaignName=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {id,name}=req.body;
        const user = (req as any).user;
        const userId = user.sub;
        const isEdited=await editCampaignNameDB(userId,id,name);

        if(!isEdited){
            return res.status(400).send({status:false,message:"Invalid campaign ID"});
        }

        return res.status(200).send({status:true,message:"Campaign name updated sucessfully"});
    }catch(err){
        console.error("An error occured while editing campaign Name");
        return res.status(500).send({status:false,message:"Unable to edit campaign name"});
    }
}

export {scheduleCampaign,pauseCampaign,resumeCampaign,cancelCampaign,getProgress,getCampaignStatus,getCampaignResult,getCampaigns,deleteCampaign,editCampaignName};


