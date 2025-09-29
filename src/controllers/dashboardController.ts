import { Request, Response } from "express";
import {getCampaignsDataFromDB,getLeadConversion,getAgentMessageCount,getrecentCampaignsData,getLeadConversionPerCampaign,getRecentConversations,getRecentNotifications} from "../models/dashboardModel";

const getCampainsData=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId,companyId}=req.body;

        const {filter}=req.query;

        const {activeCampaigns,nonActiveCampaigns}=await  getCampaignsDataFromDB(userId,filter as string);

        //getting conversation data from mongo
        const {conversion,totalChats,webCompletedChats,whatsAppCompletedChats,emailCompletedChats}=await getLeadConversion(userId,companyId,filter as string);

        return res.status(200).send({status:true,data:{activeCampaigns,nonActiveCampaigns,conversion,totalChats,webCompletedChats,whatsAppCompletedChats,emailCompletedChats}});
    }catch(err){

        console.error(err);
        return res.status(500).send({status:false,message:"Some error occured."});
    }
}


const getAgentPerformance=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId,companyId}=req.body;

        const {filter}=req.query;

        const data=await getAgentMessageCount(userId,companyId,filter as string);

        return res.status(200).send({status:true,data});
    }catch(err){

        console.error("An error occured while getting agent performace : ",err);
        return res.status(500).send({status:false,message:"Could not get agent performance. Try again later"});
    }
}


const getRecentActivity = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, companyId } = req.body;

    const campaigns = await getrecentCampaignsData(userId);

    const data = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        const flowIds = Object.values(campaign.subFlows);
        const {conversion} =campaign.status!=="5" ?  await getLeadConversionPerCampaign(flowIds) : {conversion:null};
        const agents = Object.keys(campaign.subFlows);

        return {
          name: campaign.name,
          agents,
          conversion,
          status : campaign.status=="5" ? "draft" : (campaign.status=="2" ? "running" : (campaign.status=="3" ? "paused" :"canceled")) ,
          url: "https://localhost:3000/campaigns",
          scheduledAt: campaign.scheduledAt,
        };
      })
    );

    const conversations = await getRecentConversations(userId,companyId);
    const notifications = await getRecentNotifications(userId);

    return res.status(200).send({
      status: true,
      data: {
        campaigns: data,
        conversations,
        activity: notifications,
      },
    });
  } catch (err) {
    console.error("An error occurred while getting activity:", err);
    return res.status(500).send({
      status: false,
      message: "Could not get recent activity. Try again",
    });
  }
};


export {getCampainsData,getAgentPerformance,getRecentActivity};