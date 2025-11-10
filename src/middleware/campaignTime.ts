import { Request,Response,NextFunction } from "express";

import { calculateTimezoneDelay } from "../utils/timezoneUtil";
import { updateTimezone } from "../models/campaignModel";
const validateCampaignTime=async(req : Request,res : Response,next : NextFunction) : Promise<any>=>{

    try{
        const {scheduledAt,timezone,campaignId}=req.body; 
        if(!timezone){
            return res.status(400).send({status:false,message:"Timezone required"});
        }

        //storing timezone in table
        await updateTimezone(campaignId,timezone,scheduledAt);
        const delay=calculateTimezoneDelay(timezone,scheduledAt);

        console.log("delay => ",delay);

        if(delay < 0){

            return res.status(400).send({status:false,message:"Date/Time has already passed for the given timezone date"});
        }

        req.body.delay=delay;

        return next();
    }catch(err){

        console.error("Error occured while validating time : ",err);

        return res.status(500).send({status:false,message:"Could not schedule. Try again later"});
    }
}


export default validateCampaignTime;