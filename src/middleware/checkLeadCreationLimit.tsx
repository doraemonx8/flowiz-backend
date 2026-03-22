// import { Request,Response,NextFunction } from "express";
// import {checkLeadCount} from "../models/authorizationModel";

// const checkLeadCreationLimit=async(req:Request,res:Response,next:NextFunction)=>{

//     try{

//         const {userId}=req.body;

//         const isAllowed=await checkLeadCount(userId);

//         if(!isAllowed){
//             return res.status(400).send({status:false,message:"You cannot add more leads. Subscribe to a plan."});
//         }

//         return next();
//     }catch(err){

//         console.error(err);
//         return res.status(500).send({status:false,message:"Some error occured while checking lead limit."});
//     }
// }

// export default checkLeadCreationLimit;

import { Request, Response, NextFunction } from "express";
import QuotaEngine from "../utils/quotaEngine";
import { FEATURE_SLUGS } from "../utils/quotaUtils";

const checkLeadCreationLimit = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.body;
        
        // Use the unified QuotaEngine
        const quota = await QuotaEngine.checkQuota(userId, FEATURE_SLUGS.LEADS);

        // if (!quota.allowed) {
        //     return res.status(400).send({ status: false, message: "You cannot add more leads. Quota exhausted or no active plan." });
        // }
        if (!quota.allowed) {
            return res.status(429).send(QuotaEngine.formatQuotaError(quota));
        }

        // Maintain legacy injection for the controller
        req.body.subscriptionId = quota.subscriptionId;
        return next();
    } catch (err) {
        console.error("Lead Limit Error:", err);
        return res.status(500).send({ status: false, message: "Some error occurred while checking lead limit." });
    }
}

export default checkLeadCreationLimit;