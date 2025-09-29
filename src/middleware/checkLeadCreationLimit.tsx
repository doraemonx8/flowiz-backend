import { Request,Response,NextFunction } from "express";
import {checkLeadCount} from "../models/authorizationModel";

const checkLeadCreationLimit=async(req:Request,res:Response,next:NextFunction)=>{

    try{

        const {userId}=req.body;

        const isAllowed=await checkLeadCount(userId);

        if(!isAllowed){
            return res.status(400).send({status:false,message:"You cannot add more leads. Subscribe to a plan."});
        }

        return next();
    }catch(err){

        console.error(err);
        return res.status(500).send({status:false,message:"Some error occured while checking lead limit."});
    }
}

export default checkLeadCreationLimit;