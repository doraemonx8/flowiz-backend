import { checkAudienceAndSetLeads, getCampaignIdBySlug, updateCampaignAgents,updateCampaignEmail } from '../models/campaignModel';
import { Request, Response, NextFunction } from 'express';
import { getUserTemplates } from '../models/templateModel';


const validateCampaign=async(req:Request,res:Response,next:NextFunction):Promise<void>=>{

    try{

        const {slug,userId,agents,audienceId,emailId}=req.body;

        //Checking if campaign exists
        const campaigns = await getCampaignIdBySlug(slug, userId);

        const campaignId = campaigns?.[0]?.id;

        if (!campaignId) {
            res.status(401).send({status:false,message:"Not authorised to schedule this campaign"});

            return;
        }


        //checking if audience ID is present
        if(!audienceId || !Boolean(parseInt(audienceId))){

            res.status(404).send({status:false,message:"Need audience for schedulling campaign"});
            return;
        }

      

        //checking if audience has leads
        const leadsCount=await checkAudienceAndSetLeads(audienceId,userId,campaignId);

        if(!leadsCount){
            res.status(404).send({status:false,message:"Need leads in audience"});
            return;
        }


        if(!agents){
            res.status(400).send({status:false,message:"Need atleast one agent"});
            return;
        }

        //saving agents in DB
        await updateCampaignAgents(campaignId,agents.join(","));

        //checking if email agent & if any email present
        for (const agent of agents){

            switch(agent){

                // case "email":
                //     const emails : any[]=await getAllVerifiedEmails(userId);

                //     verifiedEmailCount=emails.length;
                //     if(!emails.length){
                //         res.status(404).send({status:false,message:"Need atleast one verified email for Email Agent"});
                //         return;
                //     }


                //     emailId ? await updateCampaignEmail(campaignId,emailId) : await updateCampaignEmail(campaignId,emails[0]?.id);
                    
                //     break;

                case "whatsapp":
                    const templates=await getUserTemplates(userId);


                    const metaTemplates : any[]=templates.filter((template : Record<string,any>)=>{
                        const status=JSON.parse(template.templateJson).status;
                        return template.templateFor==='2' && status==="approved"
                    });

                    if(!metaTemplates.length){

                        res.status(404).send({status:false,message:"Need atleast one meta approved template for WhatsApp Agent"});
                        return;
                    }

                    break;
            }
        }

        req.body.campaignId=campaignId;
        req.body.leadsCount=leadsCount;
        next();
        return;
    }catch(err){

        res.status(500).send({status:false,message:"Could not validate campaign. Try again later"})
        return;
    }
}


export default validateCampaign;
