import { checkCrawlLeadCount } from "../models/authorizationModel";
import {Request,Response,NextFunction} from "express";

const checkCrawlLeadLimit=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{

    try{

        const {userId}=req.body;

        const isAllowed=await checkCrawlLeadCount(userId);


        if(!isAllowed){

            return res.status(400).send({status:false,message:"Crawl Lead limit reached. Subscribe to a plan."});
        }

        return next();
    }catch(err){
        console.error(err);
        return res.status(500).send({status:false,message:"Some issue while checking crawl lead limit"});
    }
}

export default checkCrawlLeadLimit;