import { Request, Response } from 'express';


import { generateParentFlow,generateEmails,generateCalls,generateChats } from '../utils/flowPrompt';

import db from "../models/conn";

import {upsertFlowConfig,getFlowConfigFromDB,getSubFlowDataFromDB,getParentFlowPrompt,saveSubFlowToDB,getAudiencesFromDB,saveFlowConfigDB,getFlowConfigDB,getFlowDataFromDB,updateFlowDescriptionData,updateSubFlowDB,getSubflowsConfig} from '../models/flowModel';
import { createCampaign, getCampaignIdBySlug, updateCampaignAudience } from '../models/campaignModel';

import {encryptId,decryptId} from "../utils/encryptDecrypt";
import { jsonrepair } from "jsonrepair";
// import { addUtmSource } from '../utils/emailUtil';



const createParentFlow=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId,description,companyId,data,subscriptionId} =req.body;

        if(!description || !userId || !companyId){
            return res.status(400).send({status:false,message:"Unauthorized Request"});
        }


        if(!data){
            return res.status(400).send({status:false,message:"Required data"});
        }

        const flow=data;        
        const slug=`${flow.product_name.split(" ").join("-")}-${flow.target.split(" ").join("-")}-${flow.leads}-${new Date().getTime()}`.replaceAll("/","-").replaceAll(",","").replace(/[^a-zA-Z0-9 ]/g, ''); //remove any special chars
        const Flows=db.flows;

        //creating new flow
        const flowData=await Flows.create({userId,slug,prompt:description,json:flow});

        //creating new camapign
        const name=`${flow.product_name}-${flow.target}`
        await createCampaign(userId,companyId,flowData.id,name,subscriptionId);
        return res.status(200).send({status:true,flow:{...flow,slug}});
    }catch(err){
        console.error("An error occured while getting parent flow : ",err);
        
        return res.status(501).send({status:false,message:"Some error occured. Try again later"});
    }
}




const setWebConfig=async(req:Request,res:Response):Promise<any>=>{
    try{

        const {userId,botName,description,greetingMessage,color,botPosition,flowSlug,websiteURL}=req.body;
        const updatedId=await upsertFlowConfig(userId,JSON.stringify({botName,description,greetingMessage,color,botPosition,websiteURL}),flowSlug,'2');
        if(!updatedId){

            return res.status(500).send({status:false,message:"Could not set flow config"});
        }

        const encryptedId=encryptId(updatedId);

        const jsURL=`https://cybernauts.one/server-panel-ts/bot/bot.js?id=${encryptedId}`;
        // const cssURL=`https://cybernauts.one/server-panel-ts/bot/bot.css`;
        return res.status(200).send({status:true,message:"Flow config set/updated",data:{js:jsURL}});
    }catch(err){

        console.error("An error occured while setting config");

        return res.status(500).send({status:false,message:"Some error occured while setting config. Try again"});
    }
}

const setSubFlowConfig=async(req:Request,res:Response):Promise<any>=>{

    try{
        const {configData,type,slug,userId}=req.body;
        const isSaved=await upsertFlowConfig(userId,JSON.stringify(configData),slug,type);
        if(!isSaved){
            return res.status(400).send({status:false,message:"Could not save sub flow config"});
        }
        return res.status(200).send({status:true,message:"Config saved"});
    }catch(err){
        console.error("An error occured while setting sub flow : ",err);
        return res.status(500).send({status:false,message:"Try again later"});
    }
}


const getEncryptedId=async(req:Request,res:Response):Promise<any>=>{
    const {id}=req.body;
    const decrypted=await encryptId(id);
    return res.status(200).send({data:decrypted});
}

const getWebConfig = async (req: Request, res: Response): Promise<any> => {
    try {

        const { encryptedId } = req.query;
        const origin = req.get("origin");
        if (!encryptedId || typeof encryptedId !== 'string') {
            return res.status(400).send({ status: false, message: "Invalid encryptedId" });
        }

        const id = decryptId(encryptedId);
        if (id === null) {
            return res.status(400).send({ status: false, message: "Invalid ID after decryption" });
        }
        const data : any = await getFlowConfigFromDB(id);
        const website=JSON.parse(data[0].configData as string).websiteURL;
        if(website!==origin){
            return res.status(400).send({status:false,message:`Web bot only allowed for website : ${website}`});
        }
        return res.status(200).send({ status: true, data });
    } catch (err) {
        console.error("An error occurred while getting flow config:", err);
        return res.status(500).send({ status: false, message: "Could not get flow config, Try again" });
    }
};




const validateFlowPrompt=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {prompt}=req.body;

        if(!prompt){

            return res.status(400).send({status:false,message:"Prompt required"});
        }
        
        const data=JSON.parse(await generateParentFlow(prompt));
        //saving in DB
        return res.status(200).send({status:true,data});
    }catch(err){
        console.error("An error occured while validating flow prompt : ",err);
        return res.status(500).send({status:false,message:"Some error occured. Try again later"});
    }
}


//only for testing
const generateEmailByPrompt=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {prompt}=req.body;

        const data=JSON.parse(await generateEmails(prompt));

        return res.status(200).send({status:true,data});
    }catch(err){

        console.error("An error occured while generating emails : ",err);
        return res.status(500).send({status:false,message:"Some error occured. Try again"});
    }
}


const getSubFlow = async (req: Request, res: Response): Promise<any> => {
    try {
        const {slug, type} = req.query as { slug?: string; type?: string };
        const {userId}=req.body;
        if (!slug || !type) {
            return res.status(400).json({ status: false, message: "Slug and Type required" });
        }
        const typeToTypeId: Record<string, string> = { email: "1", chat: "2", call: "3", whatsapp :"4" };

        if (!(type in typeToTypeId)) {
            return res.status(400).json({ status: false, message: "Invalid type provided" });
        }
        const subFlowData = await getSubFlowDataFromDB(slug, typeToTypeId[type],userId);
        // Ensure subFlowData is properly formatted
        const flowDataExists = Boolean(subFlowData.length > 0 && (subFlowData[0].flowData || subFlowData[0].json));

        if (flowDataExists) {
            return res.status(200).json({ status: true, data: subFlowData[0], isNew: false });
        }
        // If subFlowData is empty, generate new data
        // check campaign id before LLM calls
        const campaigns = await getCampaignIdBySlug(slug, userId);
        const campaignId = campaigns?.[0]?.id;
        if (!campaignId) {
            res.status(404).send({status:false,message:"Campaign not found"});
            return;
        }
        const parentFlowPrompt = await getParentFlowPrompt(slug);
        if (!parentFlowPrompt) {
            return res.status(404).json({ status: false, message: "Parent flow prompt not found" });
        }

        let generatedData=[];
        switch(type){
            case "email":
                generatedData = JSON.parse(jsonrepair(await generateEmails(parentFlowPrompt)));
                break;
            
            case "call":
                generatedData = JSON.parse(jsonrepair(await generateCalls(parentFlowPrompt)));
                break;
            
            case "chat":
                generatedData = JSON.parse(jsonrepair(await generateChats(parentFlowPrompt)));
                break;
            
            case "whatsapp":
                generatedData = JSON.parse(jsonrepair(await generateChats(parentFlowPrompt)));
                break;
        }
        console.log("Generated Data: ",generatedData);
        await saveSubFlowToDB(JSON.stringify(generatedData),slug,typeToTypeId[type],userId,campaignId);

        const data={flowData:null,flowShowData:null,json:generatedData};
        return res.status(200).json({ status: true, data, isNew: true });
    } catch (err) {
        console.error("An error occurred while getting sub-flow:", err);
        return res.status(500).json({ status: false, message: "Some error occurred. Try again" });
    }
};



const saveSubFlow=async(req : Request,res:Response) : Promise<any>=>{
    try{
        const {slug,type,flowData,flowShowData,userId}=req.body;
        if(!slug || !type || !flowData || !flowShowData){
            return res.status(400).send({status:false,message:"Missing required paramters"});
        }
        //fetch campaign id - Moonis
        const campaigns = await getCampaignIdBySlug(slug, userId);
        const campaignId = campaigns?.[0]?.id;
        if (!campaignId) {
            res.status(404).send({status:false,message:"Campaign not found"});
            return;
        }
        //saving in DB
       const isSaved= await updateSubFlowDB(userId,campaignId,flowData,flowShowData,type,slug);
       if(!isSaved){
        return res.status(500).send({status:false,message:"Could not save Flow"});
       }
        return res.status(200).send({status : true,message:"Flow saved"});
    }catch(err){
        console.error("An error occured while saving flow : ",err);
        return res.status(500).send({status:false,message:"Could not save flow. Try again"});
    }
}



const setFlowConfig=async(req : Request,res:Response) : Promise<any>=>{
    try{
        const {botName,botDescription,slug,userId}=req.body;

        const configData=JSON.stringify({botName,botDescription});
        const isDataSaved=await saveFlowConfigDB(configData,userId,slug);

        if(!isDataSaved){
            return res.status(400).send({status : false,message:"Could not save config. Try again later"});
        }

        return res.status(200).send({status:true,message:"Flow config saved"});
    }catch(err){

        console.error("An error occured while setting flow config : ",err);
        return res.status(500).send({status:false,message:"Could not save config. Try again"});
    }
}


const getFlowConfig=async(req : Request, res: Response) : Promise<any>=>{
    try{

        const {userId}=req.body;
        const slug =req.query.slug as string;
        const data=await getFlowConfigDB(slug,userId);

        return res.status(200).send({status:true,data});
    }catch(err){

        console.error("An error occured while getting flwo config : ",err);
        return res.status(500).send({status : false,message :" an error occured while getting flow config"});
    }
}


const getFlowData=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {userId}=req.body;
        const {slug}=req.query;
        const data : any=await getFlowDataFromDB(userId,slug as string);
        
        if(!data){
            return res.status(404).send({status:false,message:"Invalid slug"});
        }

        //getting audiences
        const audiences=await getAudiencesFromDB(userId);

        //getting bot config
        const botsConfig=await getSubflowsConfig(userId,slug as string);

        botsConfig?.forEach((config : any)=>{

            if(config?.type=="web"){

                const encryptedId=encryptId(config.id);
                config['jsURL']=`https://cybernauts.one/server-panel-ts/bot/bot.js?id=${encryptedId}`;
            }

            delete(config.id);
        })

        let campaignStatus;
        switch (data.status) {
        case "2":
            campaignStatus = "running";
            break;
        case "5":
            campaignStatus = "draft";
            break;
        case "3":
            campaignStatus = "paused";
            break;
        default:
            campaignStatus = "cancelled";
        }

        const productDetails=JSON.parse(data?.json as string);

        const result={
            isMetaConnected:Boolean(data?.metaTokenData),
            isEmailConnected:Boolean(data?.emailCount),
            isZohoConnected:Boolean(data?.zohoTokenData),
            isOutlookConnected:Boolean(data?.outlookTokenData),
            isGoogleConnected:Boolean(data?.googleTokenData) || Boolean(data?.emailCount),
            bot:data.configData || productDetails?.bot,
            prompt:data.prompt,
            campaignStatus,
            timezone:data.timezone,
            scheduledAt:data.scheduledAt,
            campaignName:data.name,
            campaignEmailIds:data.campaignEmailIds,
            keywordId:data?.keywordId,
            audienceId:data?.audienceId,
            keywords:data?.keywords,
            template:data.template,
            productName:productDetails?.product_name,
            productType:productDetails?.product_type,
            productTarget:productDetails?.target,
            source:productDetails?.leads,
            website:productDetails?.website || null,
            emailAgent:Boolean(productDetails?.features.email > 0),
            whatsappAgent:Boolean(productDetails?.features.whatsApp > 0),
            webAgent:Boolean(productDetails?.features.chatbot > 0),
            callAgent:Boolean(productDetails?.features.call > 0),
            audiences,
            botsConfig
        }


        return res.status(200).send({status:true,data:result})

    }catch(err){

        console.error("An error occured : ",err);
        return res.status(500).send({status:false,message:"An error occured while getting flow data"});
    }
}


const setFlowDescriptionData=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {slug,businessName,businessType,website,source,userId,audienceId}=req.body;
        const isSaved=await updateFlowDescriptionData(userId,slug,businessName,businessType,website,source);
        const isAudienceUpdated= audienceId ? await updateCampaignAudience(userId,slug,audienceId) : true;
        if(!isSaved || !isAudienceUpdated){
            return res.status(500).send({status:false,message:"Could not save"});
        }
        return res.status(200).send({status:true,message:"Saved!!"});

    }catch(err){
        console.error(err);
        return res.status(500).send({status:false,message:"Could not set flow description."});
    }
}

export {createParentFlow,setWebConfig,getWebConfig,validateFlowPrompt,generateEmailByPrompt,getSubFlow,saveSubFlow,setFlowConfig,getFlowConfig,getEncryptedId,getFlowData,setFlowDescriptionData,setSubFlowConfig};
