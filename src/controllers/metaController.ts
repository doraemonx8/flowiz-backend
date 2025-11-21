import {Request,Response} from "express";
import crypto from 'crypto';
import axios from "axios";
import {removeTokensFromDB, saveTokensInDB} from "../models/userModel";
import {sendMessageFromMeta, subscribeWebhook,disconnect, registerPhone} from "../utils/meta";
import { getWhatsAppChatId } from "../models/chats";
import {botController} from "./botController";
import { sendMessageToAgent } from "../utils/eventManager";
import { getWABAIDAndToken } from "../models/templateModel";
import BotGraph from '../utils/botGraph';
import scheduleMessages from "../utils/scheduleUtil";

const APP_SECRET="3c412cb47f456d5a972a1f998e0fc379";

const webhook=async(req:Request,res:Response):Promise<any>=>{
    try{
        const signature = req.headers['x-hub-signature-256'] as string;
        if(!signature){
            return res.status(401).send({status:false});
        }

        const elements = signature.split('=');
        const signatureHash = elements[1];
        const expectedHash = crypto
            .createHmac('sha256', APP_SECRET) 
            .update(req.body) 
            .digest('hex');

        if (signatureHash !== expectedHash) {
            console.error('Webhook signature verification failed! Possible spoofed request.');
            return res.status(401).send({ status: false, error: "Invalid signature" });

        }

        const payload=JSON.parse(req.body.toString());
        if(!payload.entry[0].changes[0].value?.contacts){

            console.log("webhook status other than recieved");
            return res.status(200).send('OK');
        }


        const entry = payload.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;

        const phoneNumberId = value?.metadata?.phone_number_id;
        const from = value?.contacts?.[0]?.wa_id;
        const message = value?.messages?.[0]?.text?.body;
        

        //find chat
        let chat=await getWhatsAppChatId(phoneNumberId,from);
        if(!chat){
            // to be fixed later for country code
            const fromWithout = from.slice(-10); //removing country code '91' for india
            chat=await getWhatsAppChatId(phoneNumberId,fromWithout);
        }
        
        if(!chat){
            console.log("could not find chat");
            return res.status(200).send({status:true});
        }

        const botGraph=new BotGraph();
        const state=await botGraph.processMessage({chatId : chat._id,message,userId : chat.userId,companyId : chat.companyId,adminId : chat.adminId,flowId : chat.flowId},{});
        
        const response=state.params.botResponse;
        // const response=await botController(message,chat._id,chat.flowId,chat.userId,chat.companyId);

        console.log("----------response in meta webhook -----------------");
        console.log(response);
        console.log("-------------------------------");
        if (typeof (response) === 'object') {
                // If botResponse is an object, return its message property
                await sendMessageFromMeta(chat.adminId,from,response.message);
                await sendMessageToAgent(chat.companyId,{type:"messageAdded",message:{userId:chat.userId,message:response.message,createdOn:new Date().getTime(),isBot:true,isSeen:false},chatId:chat._id});
                
                    
        } else {
                    // Otherwise, return botResponse directly
                await sendMessageFromMeta(chat.adminId,from,response);
                response?.isAgent ? null :  sendMessageToAgent(chat.companyId,{type:"messageAdded",message:{userId:chat.userId,message:response,createdOn:new Date().getTime(),isBot:true,isSeen:false},chatId:chat._id});
                
                
        }

        //schedulle messages for current chat
        await scheduleMessages(state.params,"whatsapp");
        //sending response
        return res.status(200).send({status:true});
    }catch(err){
        console.error(err);
        return res.status(500).send({status:false});
    }
}


const connectMeta=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {code, business_id, waba_id, phone_number_id,userId}=req.body;

        //getting long lived user access token
        const tokenData=await axios.get("https://graph.facebook.com/v23.0/oauth/access_token",{
            params:{
                client_id:process.env.META_APP_ID,
                client_secret:process.env.META_APP_SECRET,
                code,
            }
        });
        const { access_token,expires_in } = tokenData.data;

        //saving data
        await saveTokensInDB(userId,'meta',{access_token ,phoneNumberId:phone_number_id,wabaId:waba_id,businessId:business_id,expiry_date:expires_in});


        await registerPhone(phone_number_id,access_token);
        await subscribeWebhook(waba_id,access_token);

        
        return res.status(200).send({status:true,message:"Connected!!"});
    }catch(err){

        console.error(err);
        return res.status(500).send({status:false,message:"Could not save"});
    }
}


const disconnectMeta=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId}=req.body;

        const {phoneNumberId,wabaID,token}=await getWABAIDAndToken(userId) || {};

        if(!phoneNumberId){
            return res.status(400).send({status:false,message:"Meta account already disconnected"});
        }

        const isDisconnected=await disconnect(wabaID,token,phoneNumberId);

        if(!isDisconnected){

            return res.status(400).send({status:false,message:"Not able to dosconnect from meta. Try again later"});
        }

        await removeTokensFromDB(userId,'meta');

        return res.status(200).send({status:true,message:"Disconnected sucessfully"});

    }catch(err){
        console.error(err);
        return res.status(500).send({status:true,message:"Not able to disconnect. Try again later"});
    }
}






export {connectMeta,webhook,disconnectMeta};
