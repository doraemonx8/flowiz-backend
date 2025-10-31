import { getCampaignData } from '../models/campaignModel';
import { getParentFlowPrompt, saveSubFlowToDB } from '../models/flowModel';
import { generateCalls, generateChats, generateEmails } from '../utils/flowPrompt';
import { Request, Response, NextFunction } from 'express';


const createSubFlowsForCampaign=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{
    try{
        const {slug,userId,scheduledAt,agents,audienceId,template,campaignId}=req.body;
        if(!agents || !agents.length){
            return res.status(400).send({status:false,message:"Need atleast one agent to proceed"});
        }
        const campaignData=await getCampaignData(campaignId);
        const subFlows=JSON.parse(campaignData[0].subFlows);
        const parentFlowPrompt = await getParentFlowPrompt(slug);
        
        if (!parentFlowPrompt) {
            return res.status(404).json({ status: false, message: "Parent flow prompt not found" });
        }

        let isEmailAgent=false;
        let isCallAgent=false;
        let isWebAgent=false;
        let isWhatsappAgent=false;

        for (const agent of agents){

            switch(agent){

                case "email":
                    isEmailAgent=true;
                    const isEmailFlow=subFlows.filter((subFlow : any)=> subFlow.type==1 && (subFlow.json || subFlow.flowData)).length;
                    if(!isEmailFlow){
                    //EMAIL
                    const emailGeneratedData = JSON.parse(await generateEmails(parentFlowPrompt));
                    const emailSubFlowId=await saveSubFlowToDB(JSON.stringify(emailGeneratedData),slug,"1",userId,campaignId);
                    subFlows.push({type:"1",id:emailSubFlowId,flowData:null,json:emailGeneratedData});

                    }
                    break;
                
                case "web":
                    isWebAgent=true;
                    const isWebFlow=subFlows.filter((subFlow:any)=>subFlow.type==2).length;

                    if(!isWebFlow){
                        //WEB CHAT
                        const chatGeneratedData = JSON.parse(await generateChats(parentFlowPrompt));
                        const chatSubFlowId=await saveSubFlowToDB(JSON.stringify(chatGeneratedData),slug,"2",userId,campaignId);
                        subFlows.push({type:"2",id:chatSubFlowId,flowData:null,json:chatGeneratedData});
                    }

                    break;
                
                case "call":
                    isCallAgent=true;
                    const isCallFlow=subFlows.filter((subFlow:any)=>subFlow.type==3).length;

                    if(!isCallFlow){

                        //CALL
                        const callGeneratedData = JSON.parse(await generateCalls(parentFlowPrompt));
                        const callSubFlowId=await saveSubFlowToDB(JSON.stringify(callGeneratedData),slug,"3",userId,campaignId);
                        subFlows.push({type:"3",id:callSubFlowId,flowData:null,json:callGeneratedData});
                    }

                    break;
                case "whatsapp":

                    isWhatsappAgent=true;
                    const isWhatsAppFlow=subFlows.filter((subFlow:any)=>subFlow.type==4).length;

                    if(!isWhatsAppFlow){
                        //WHATSAPP
                        const generatedData = JSON.parse(await generateChats(parentFlowPrompt));
                        const whatsAppSubFlowId=await saveSubFlowToDB(JSON.stringify(generatedData),slug,"4",userId,campaignId);
                        subFlows.push({type:"4",id:whatsAppSubFlowId,flowData:null,json:generatedData});
                    }
                    break;
                
            }
        }
    
       req.body.isEmailAgent=isEmailAgent;
       req.body.isCallAgent=isCallAgent;
       req.body.isWebAgent=isWebAgent;
       req.body.isWhatsappAgent=isWhatsappAgent;
       req.body.subFlows=subFlows;
       req.body.campaignData=campaignData;

       next();

    }catch(err){

        console.error(err);
        return res.status(500).send({status:false,message:"Could not create agent workflows. Try again later"});
    }
}


export default createSubFlowsForCampaign;