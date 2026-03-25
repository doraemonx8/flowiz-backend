// import { decryptId } from "../utils/encryptDecrypt";
// import { checkMessageLimit } from "../models/authorizationModel";
// import {Request,Response,NextFunction} from "express";
// import { getCompanyIdByFlow } from "../models/flowModel";


// const checkWebMessageLimit=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{


//     try{
//         const {encryptedId } = req.body;

//         if (!encryptedId || typeof encryptedId !== 'string') {
//             return res.status(400).send({ status: false, message: "Invalid encryptedId" });
//         }

//         const flowId = decryptId(encryptedId);

//         if (flowId === null) {
//             return res.status(400).send({ status: false, message: "Invalid ID after decryption" });
//         }

//         const {companyId,adminId}=await getCompanyIdByFlow(flowId);

//         if (!companyId) {
//             throw new Error('Company ID not found for flow.');
//         }

//         const isAllowed=await checkMessageLimit(adminId,"chatbot");

//         if(!isAllowed){
//             return res.status(400).send({status:false,message:"Web Chatbot limit reached. Subscribe to a plan."});
//         }


//         req.body.subscriptionId=isAllowed.subscriptionId;
//         req.body.adminId=adminId;
//         req.body.companyId=companyId;
//         req.body.flowId=flowId;
//         return next();
//     }catch(err){
//         console.error(err);
//         return res.status(500).send({status:false,message:"Unable to check message limit."});
//     }
// }

// export default checkWebMessageLimit;

import { decryptId } from "../utils/encryptDecrypt";
import { getCompanyIdByFlow } from "../models/flowModel";
import QuotaEngine from "../utils/quotaEngine";
import { FEATURE_SLUGS } from "../utils/quotaUtils";
import { Request, Response, NextFunction } from "express";

const checkWebMessageLimit = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const { encryptedId } = req.body;

        if (!encryptedId || typeof encryptedId !== 'string') {
            return res.status(400).send({ status: false, message: "Invalid encryptedId" });
        }

        const flowId = decryptId(encryptedId);

        if (flowId === null) {
            return res.status(400).send({ status: false, message: "Invalid ID after decryption" });
        }

        const { companyId, adminId } = await getCompanyIdByFlow(flowId);

        if (!companyId) {
            throw new Error('Company ID not found for flow.');
        }
        if (!adminId) {
            console.log("REQ USER - ",req.body.userId)
            return res.status(400).send({ status: false, message: "Admin ID not found" });
        }

        // Use the unified QuotaEngine to check the bot message limit for the admin
        const quota = await QuotaEngine.checkQuota(adminId, FEATURE_SLUGS.CHATBOT_MESSAGES);

        // if (!quota.allowed) {
        //     return res.status(400).send({ status: false, message: "Web Chatbot limit reached. Subscribe to a plan." });
        // }
        if (!quota.allowed) {
            return res.status(429).send(QuotaEngine.formatQuotaError(quota));
        }

        // Maintain legacy variables for the next controller
        req.body.subscriptionId = quota.subscriptionId;
        req.body.adminId = adminId;
        req.body.companyId = companyId;
        req.body.flowId = flowId;
        
        return next();
    } catch (err) {
        console.error("Web Message Limit Error:", err);
        return res.status(500).send({ status: false, message: "Unable to check message limit." });
    }
}

export default checkWebMessageLimit;