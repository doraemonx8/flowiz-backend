import { decryptId } from "../utils/encryptDecrypt";
import { checkMessageLimit } from "../models/authorizationModel";
import {Request,Response,NextFunction} from "express";
import { getCompanyIdByFlow } from "../models/flowModel";


const checkWebMessageLimit=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{


    try{
        const {encryptedId } = req.body;

        if (!encryptedId || typeof encryptedId !== 'string') {
            return res.status(400).send({ status: false, message: "Invalid encryptedId" });
        }

        const flowId = decryptId(encryptedId);

        if (flowId === null) {
            return res.status(400).send({ status: false, message: "Invalid ID after decryption" });
        }

        const {companyId,adminId}=await getCompanyIdByFlow(flowId);

        if (!companyId) {
            throw new Error('Company ID not found for flow.');
        }

        const isAllowed=await checkMessageLimit(adminId,"chatbot");

        if(!isAllowed){
            return res.status(400).send({status:false,message:"Web Chatbot limit reached. Subscribe to a plan."});
        }


        req.body.subscriptionId=isAllowed.subscriptionId;
        req.body.adminId=adminId;
        req.body.companyId=companyId;
        req.body.flowId=flowId;
        return next();
    }catch(err){
        console.error(err);
        return res.status(500).send({status:false,message:"Unable to check message limit."});
    }
}

export default checkWebMessageLimit;