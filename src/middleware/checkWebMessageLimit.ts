import { checkMessageLimit } from "../models/authorizationModel";
import {Request,Response,NextFunction} from "express";


const checkWebMessageLimit=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{


    try{

        const {userId}=req.body;

        const isAllowed=await checkMessageLimit(userId,"chatbot");

        if(!isAllowed){
            return res.status(400).send({status:false,message:"Web Chatbot limit reached. Subscribe to a plan."});
        }


        req.body.subscriptionId=isAllowed.subscriptionId;
        return next();
    }catch(err){
        console.error(err);
        return res.status(500).send({status:false,message:"Unable to check message limit."});
    }
}

export default checkWebMessageLimit;