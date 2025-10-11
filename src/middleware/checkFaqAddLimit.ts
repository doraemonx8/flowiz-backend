import { checkFaqCount } from "../models/authorizationModel";
import {Request,Response,NextFunction} from "express";


const checkFaqAddLimit=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{

    try{
        const {userId}=req.body;
        console.log(req.body)
        console.log("Checking FAQ limit for user : ",userId);
        const isAllowed=await checkFaqCount(userId);

        if(!isAllowed){
            return res.status(400).send({status:false,message:"FAQ limit reached."});
        }

        req.body.subscriptionId=isAllowed.subscriptionId;
        return next();
    }catch(err){
        console.error(err);
        return res.status(500).send({status:false,message:"Could not check FAQ limit. Try again"});
    }
}

export default checkFaqAddLimit;