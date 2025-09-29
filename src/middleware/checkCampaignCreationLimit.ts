import { checkCampaignCount } from "../models/authorizationModel";
import {Request,Response,NextFunction} from "express";


const checkCampaignCreataionLimit=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{

    try{

        const {userId}=req.body;
        const isAllowed=await checkCampaignCount(userId);


        if(!isAllowed){
            return res.status(400).send({status:false,message:"You don't have any campaigns left. Subscribe to a plan"});
            
        }

        req.body.subscriptionId=isAllowed.subscriptionId;
        return next();
        
    }catch(err){
        console.error("An error occured in check campaign middleware : ",err);
        return res.status(500).send({status:false,message:"Could not create campaign right now"});
    }
}


export default checkCampaignCreataionLimit;