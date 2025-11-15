import { Request, Response } from 'express';

import {getWABAIDAndToken,getUserTemplates,saveTemplateToDB,getTemplateByID,getPhoneNumberIdAndToken,updateMetaTemplateStatus} from '../models/templateModel';

import {getTemplatesFromMeta,sendTemplateToMeta,sendTemplateMessageFromMeta} from "../utils/meta";




const getTemplates=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {userId}=req.body;
        //getting all templates
        const templates=await getUserTemplates(userId);

        let metaTemplates : any[]=templates.map((template : Record<string,any>)=>{
            return template.templateFor==='2' //meta template
        });

        const {wabaID,token}=await getWABAIDAndToken(userId) || {wabaID :"",token:""};
        if(metaTemplates.length==0){
            return res.status(200).send({status:true,templates:[],isMetaConnected: Boolean(wabaID)});
        }

        if(!wabaID || !token){
            return res.status(200).send({status : true,templates,isMetaConnected:false});
        }

        //getting meta templates
        const templatesFromMeta=await getTemplatesFromMeta(wabaID,token);

        if(!templatesFromMeta.status){
            return res.status(400).send({status:false,message:templatesFromMeta.message});
        }
        metaTemplates=templatesFromMeta.data;
        const statusArray : Record<string,string>[]=[];

        //checking for status from meta templates
        templates.forEach((template : Record<string,any>)=>{
            if(template.templateFor=='2'){
                //check for status in templates returned by meta
                const templateId=JSON.parse(template.templateJson).id;

                const metaTemplateStatus=metaTemplates.find((t: any) => t.id === templateId)?.status || 'NA';

                template['metaStatus']=metaTemplateStatus;
                statusArray.push({id : template.id,status:template['metaStatus'].toLowerCase()});

            }
        })

        //update meta template status
        await updateMetaTemplateStatus(statusArray as any);

        //checking status of meta template
        return res.status(200).send({status:true,templates,isMetaConnected:true});

    }catch(err){

        console.error("An error occured while getting templates : ",err);

        return res.status(500).send({status:false,message:"Some error occured. Try again later"});
    }
}


const sendTemplates=async(req:Request,res:Response) : Promise<any>=>{
    try{
        const {data,userId,templateFor,type,companyId}=req.body;

        if(!data || !templateFor || !type){
            return res.status(400).send({status:false,message:"Template data,for and type required"});
        }

        if(templateFor=='2'){ //meta template
            const {wabaID,token}=await getWABAIDAndToken(userId) || {wabaID :"",token:""};
            if(!wabaID || !token){
                return res.status(400).send({status : false,message:"Connect Meta account"});
            }

            const isTemplateSendToMeta=await sendTemplateToMeta(wabaID,JSON.stringify(data),token);
            if(!isTemplateSendToMeta.status){
                return res.status(400).send({status: false,message:isTemplateSendToMeta.message});
            }
            //saving template to DB
            data['id']=isTemplateSendToMeta.data.id;
        }
        
        const templateName=data.name;
        await saveTemplateToDB(JSON.stringify(data),templateName,templateFor,userId,type,companyId);

        return res.status(200).send({status:true,message:"Template saved sucessfully"});
    }catch(err){
        console.error("An error occured while sending templates : ",err);
        return res.status(500).send({status:false,message:"Could not save template. Try again"});
    }
}


const sendTemplateMessage=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {templateId,phone,userId}=req.body;
        if(!templateId || !phone){
            return res.status(400).send({status:false,message:"Phone & templateId are required"});
        }

        const templateJSON=await getTemplateByID(templateId,userId);
        if(!templateJSON){
            return res.status(400).send({status:false,message:"No template for this ID exists"});
        }

        const templateName=JSON.parse(templateJSON[0].templateJson)?.name;

        //sending message via meta template
        const metaTemplateSent=await sendTemplateMessageFromMeta(userId,phone,{template:templateName});
        //adding chat - TODO I guess

        return res.status(200).send({data:metaTemplateSent});
    }catch(err){

        console.error("An error occured while sending template message : ",err);
        return res.status(500).send({status:false,message:"Could not send template. Try again"});
    }
}

const getMetaApprovedTemplates=async(req:Request,res:Response):Promise<any>=>{
    try{
        const {userId}=req.body;
        const templates=await getUserTemplates(userId);
        const metaTemplates : any[]=templates.filter((template : Record<string,any>)=>{
            const status=JSON.parse(template.templateJson).status;
            return template.templateFor==='2' && status==="approved"
        });
        return res.status(200).send({status:true,data:metaTemplates});
    }catch(err){
        console.error("An error occured while getting templates : ",err);
        return res.status(500).send({status:false,message:"Could not get templates.Try again later"});
    }
}


const uploadTemplateFile=async(req:Request,res:Response):Promise<any>=>{
    try{
        return res.status(200).send({status:true,name:req.file?.filename});
    }catch(err){
        console.error("An error occured while uploading template file");
        return res.status(500).send({status:false,message:"Could not upload file"});
    }
}

export {getTemplates,sendTemplates,sendTemplateMessage,getMetaApprovedTemplates,uploadTemplateFile};
