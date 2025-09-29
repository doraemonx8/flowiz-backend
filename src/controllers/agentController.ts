import {type Request,type Response} from 'express';
import { addMessage,checkCompanyForAgent, handleAgentHandover, getChatData } from '../models/chats';
import {addMessageForChat} from "../utils/botMongo";
import { sendMessageToWebUser } from '../utils/eventManager';
// import {sendGmailReply} from "../utils/googleUtil";
import {getLeadMail} from "../models/leadModel";
import {sendEmailReply} from "../utils/emailUtil";
import {getEmailData} from "../models/emailModel";
import { sendMessageFromMeta } from '../utils/meta';


const typeToHostMap : any={
    "gmail":"smtp.gmail.com",
    "outlook":"smtp.office365.com",
    "zoho":"smtp.zoho.in"
}

const sendMessage=async(req:Request,res:Response) : Promise<any>=>{


    try{

        const {userId,companyId,message,chatId}=req.body;

        //middleware to verify if the user/agent belongs to same the company as the chat
        if(! await checkCompanyForAgent(chatId,companyId)){

            return res.status(400).send({status:false,message:"Agent not authorized for the given chat"});
        }

        //getting type of channel
        const chat=await getChatData(chatId);

        if(!chat){
            return res.status(400).send({status:false,message:"Unable to find chat"});
        }

        //EMAIL
        if(chat.channel==="email"){
            
            const lastMessage=chat.messages.reverse()[0];
            let references="";

            if(!lastMessage.isAgent && !lastMessage.isBot){ //replying to a user's email
                references=chat.messages.map((message)=> message.messageId).join(" ");
            }

            // const threadId=chat.threadId;
            const lastMessageId=lastMessage.messageId;
            const subject=lastMessage.subject;

            const leadMail=await getLeadMail(chat.userId);
            const userMail=chat.adminMail;

            const {password,type}=await getEmailData(userId,userMail as string) || {};

            if(!leadMail){
                return res.status(400).send({status:false,message:"Lead not found"});
            }
            //sending mail
            // const replyId=await sendGmailReply(userId,{from:userMail.userEmail,to:leadMail,subject,lastMessageId,body:message,threadId,references});

            const replyId=await sendEmailReply({host:typeToHostMap[type as string],userEmail:userMail,userPassword:password,from:userMail,to:leadMail,subject,body:message,lastMessageId,references})
            //add message in chat
            await addMessage(chatId,{isBot:false,isAgent:true,subject,message,createdOn:new Date().getTime(),messageId:replyId});
            return res.status(200).send({status:true,message:"Email sent"});
        
        }else if(chat.channel == 'whatsapp'){ //WHATSAPP

            console.log("sending message from whatsapp : ",message);

            await sendMessageFromMeta(chat.adminId,chat.userPhone,message);

            await addMessage(chatId,{isBot:false,isAgent:true,message,createdOn:new Date().getTime()});

        }

        
        const flowId=await addMessageForChat(chatId, message,false,"-1",true);

        if(!flowId){

            return res.status(500).send({status:false,message:"Unable to add message right now. Try again later"});
        }

        await sendMessageToWebUser(flowId,{type:"agentMessage",message});
        return res.status(200).send({status:true,message:"Message sent."});
    }catch(err){

        console.error("An error occured while sending message : ",err);

        return res.status(500).send({status:false,message:"Unable to send message right now. Try again later"});
    }
}



const agentHandover=async(req:Request,res:Response) : Promise<any>=>{

    try{

        const {userId,companyId,chatId,isHandover}=req.body;

        if (! await checkCompanyForAgent(chatId,companyId)){

            return res.status(400).send({status:false,message:"Agent not authorized for the given chat"});
        }

        const isAgentHandover =await handleAgentHandover(chatId,isHandover,userId);

        if(!isAgentHandover){

            return res.status(500).send({status:false,message:"Unable to change agent handover. Try again"});
        }

        return res.status(200).send({status:true,message:"Agent handover updated"});
    }catch(err){

        console.error("An error occured while setting agent handover : ",err);
        return res.status(500).send({status:false,message:"Unable to change agent handover. Try again"});
    }
}
export {sendMessage,agentHandover};
