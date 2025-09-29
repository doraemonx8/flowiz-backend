import { checkEmailCount } from "../models/authorizationModel";
import {Request,Response,NextFunction} from "express";


const checkEmailAddLimit=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{

    try{

        const {userId}=req.body;

        const isAllowed=await checkEmailCount(userId);

        if(!isAllowed){

            return res.status(400).send({status:false,message:"Email Limit reached."});
        }

        req.body.subscriptionId=isAllowed.subscriptionId;
        return next();
    }catch(err){
        console.error(err);
        return res.status(500).send({status:false,message:"Could not check limit. Try again later"});
    }
}


export default checkEmailAddLimit;