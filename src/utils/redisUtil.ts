import {updateCampaignStatusDB} from "../models/campaignModel";
import Redis from "ioredis";

const redis = new Redis({
  host:"localhost",
  port:6381
});


const EMAIL_DAILY_LIMIT = Number(process.env.EMAIL_DAILY_LIMIT) || 0;
const WHATSAPP_DAILY_LIMIT = Number(process.env.WHATSAPP_DAILY_LIMIT) || 0;
const CALL_DAILY_LIMIT = Number(process.env.CALL_DAILY_LIMIT) || 0;


type QuotaType = "email" | "whatsapp" | "call";

interface ChannelProgress {
  totalNodes: number;
  completedNodes: number;
  totalLeads: number;
}

// Check quota
const checkQuota = async (type: QuotaType): Promise<boolean> => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const key = `${type}-count-${today}`;

    let count = await redis.get(key);
    const currentCount = count ? parseInt(count) : 0;

    if (type === "email") return currentCount < EMAIL_DAILY_LIMIT;
    if (type === "whatsapp") return currentCount < WHATSAPP_DAILY_LIMIT;
    if (type === "call") return currentCount < CALL_DAILY_LIMIT;

    return false;
  } catch (err) {
    console.error(`An error occurred while checking count: ${err}`);
    return false;
  }
};

// Increment quota
const incrementQuota = async (type: QuotaType): Promise<void> => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const key = `${type}-count-${today}`;

    let count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, 86400);
    }
  } catch (err) {
    console.error(`An error occurred while incrementing quota: ${err}`);
  }
};




const updateCampaignStatus=async(campaignId:string | number,status:string)=>{

  try{

    const campaignKey=`campaign-${campaignId}-status`;

    await redis.set(campaignKey,status);

    await updateCampaignStatusDB(campaignId,status);

    return true;
  }catch(err){

    console.error(`An error occured while updating campaign status : ${err}`);
    return false;
  }
}


const getCampaignStatus=async(campaignId:string | number)=>{
  
  try{

    const campaignKey=`campaign-${campaignId}-status`;

    const status=await redis.get(campaignKey);

    return status;
  }catch(err){

    console.error(`An error occured while getting campaign status : ${err}`);

    return "";
  }
}

export { checkQuota, incrementQuota,updateCampaignStatus,getCampaignStatus };
