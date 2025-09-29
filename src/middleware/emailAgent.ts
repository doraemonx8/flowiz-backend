import { getAllVerifiedEmails,getEmailSignature } from "../models/emailModel";
import { updateCampaignEmail } from "../models/campaignModel";
import { Request,Response,NextFunction } from "express";
import { decryptId } from "../utils/encryptDecrypt";

const validateEmailAgent=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{

    try{

        const {isEmailAgent,leadsCount,userId,campaignId,emailId}=req.body;


        if(!isEmailAgent){

            return next();
        }


        const emails : any[]=await getAllVerifiedEmails(userId,emailId || "");

        if(!emails.length){
            res.status(404).send({status:false,message:"Need atleast one verified email for Email Agent"});
            return;
        }

        const requiredEmailCount=Math.ceil(leadsCount/100); //only 100 leads are allowed per email

        if(emails.length<requiredEmailCount){
            console.log(`Need to add more emails for leads : ${leadsCount};verifiedEmails:${emails.length}`);
            return res.status(400).send({status:false,message:"Only max 100 leads allowed per email. Need to add more emails"});
        }

        const emailData=emails.slice(0,requiredEmailCount);

        //getting email signature if present in config
        const emailSignature=await getEmailSignature(userId,campaignId);
        
        await updateCampaignEmail(campaignId,emailData.map((email) => email.id).join(","));

        //updating signature
        emailData.forEach((email : any)=>{

            email.signature=emailSignature;
            // const decryptedPassword=decryptId(email.password);

            // email.password=decryptedPassword;
        });

        
        req.body.emailData=emailData;
        return next();



    }catch(err){
        console.error("Error occured in email agent middleware : ",err);
        return res.status(500).send({status:false,message:"Could not validate campaign. Try again later"});
    }
}

export default validateEmailAgent;