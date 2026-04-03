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
import { scheduleMessages } from "../utils/scheduleUtil";
// specifically for 8076143089
import {getLeads, setLeads, createOrUpdateChat, createChat} from "../models/chats";
import { getAdminByPhoneNumberId } from "../models/userModel";
import { getSubFlowData, getWhatsAppSubFlowForAdmin } from "../models/flowModel";
import { getFirstNodeIdFromFlow } from "../utils/botFlow";

import QuotaEngine from '../utils/quotaEngine';

const APP_SECRET="3c412cb47f456d5a972a1f998e0fc379";

// const webhook=async(req:Request,res:Response):Promise<any>=>{
//     try{
//         const signature = req.headers['x-hub-signature-256'] as string;
//         if(!signature){
//             return res.status(401).send({status:false});
//         }

//         const elements = signature.split('=');
//         const signatureHash = elements[1];
//         const expectedHash = crypto
//             .createHmac('sha256', APP_SECRET) 
//             .update(req.body) 
//             .digest('hex');

//         if (signatureHash !== expectedHash) {
//             console.error('Webhook signature verification failed! Possible spoofed request.');
//             return res.status(401).send({ status: false, error: "Invalid signature" });

//         }

//         const payload=JSON.parse(req.body.toString());
//         if (!payload?.entry?.[0]?.changes?.[0]?.value?.contacts) {
//             console.log("webhook status other than recieved");
//             return res.status(200).send('OK');
//         }


//         const entry = payload.entry?.[0];
//         const change = entry?.changes?.[0];
//         const value = change?.value;

//         const phoneNumberId = value?.metadata?.phone_number_id;
//         const from = value?.contacts?.[0]?.wa_id;
//         const message = value?.messages?.[0]?.text?.body;
        

//         //find chat
//         let chat=await getWhatsAppChatId(phoneNumberId,from);
//         if(!chat){
//             // to be fixed later for country code
//             const fromWithout = from.slice(-10); //removing country code '91' for india
//             chat=await getWhatsAppChatId(phoneNumberId,fromWithout);
//         }

//         console.log("phoneNumberId :",phoneNumberId);
//         // special condition for test number 8076143089
//         if(phoneNumberId == '511981315339935'){
//         const fromWithout = from.slice(-10);
//         const leadSearchResults = await getLeads({ search: fromWithout });
//         let leadId = ``;
//         if (leadSearchResults.length > 0) {
//              leadId = leadSearchResults[0].id; 
//         } else {
//             leadId = (await setLeads({leads: [{name: `WA User ${fromWithout}`, phone: fromWithout, companyId: '1', audienceIds: ['1']}]})).result;
//         }
//         //updating in mongodb
//         const data = {
//             _id: Math.floor(10000000 + Math.random() * 90000000).toString(),                    
//             companyId: '1',       
//             userId:leadId,
//             adminId:'51',
//             userPhone:from,
//             flowId : '1',
//             flowData : '[]',
//             botRole : `Personal`,
//             currentFlowNodeId:`whatsapp-pro-0`,            
//             intents: {},
//             isAgentHandover: true,
//             isCompleted: true,
//             isDeleted: false,
//             sentiment: 'proceed',
//             channel:"whatsapp",
//             phoneNumberId,
//             messages: [{isBot:false,flowNodeId:`whatsapp-pro-0`,message,createdOn:Math.floor(Date.now() / 1000)}],
//             createdOn: Math.floor(Date.now() / 1000),
//         }
//         // const chatId=await createOrUpdateChat(data);
//         }

//         if(!chat){
//             console.log("could not find chat");
//             return res.status(200).send({status:true});
//         }

//         const quotaResult = await QuotaEngine.checkQuota(chat.adminId, "whatsapp_messages"); //check later for userId

//         if (!quotaResult.allowed) {
//             console.warn(`WhatsApp quota exhausted for Admin ID: ${chat.adminId}. Dropping bot reply to prevent overage.`);
//             // Return 200 so Meta doesn't retry the webhook
//             return res.status(200).send({status:true});
//         }

//         const botGraph=new BotGraph();
//         const state=await botGraph.processMessage({chatId : chat._id,message,userId : chat.userId,companyId : chat.companyId,adminId : chat.adminId,flowId : chat.flowId},{});
        
//         const response=state.params.botResponse;
//         // const response=await botController(message,chat._id,chat.flowId,chat.userId,chat.companyId);

//         console.log("----------response in meta webhook -----------------");
//         console.log(response);
//         console.log("-------------------------------");

//         let messageSent = false;

//         if (typeof (response) === 'object') {
//             // If botResponse is an object, return its message property
//             await sendMessageFromMeta(chat.adminId,from,response.message);
//             await sendMessageToAgent(chat.companyId,{type:"messageAdded",message:{userId:chat.userId,message:response.message,createdOn:new Date().getTime(),isBot:true,isSeen:false},chatId:chat._id});
//             messageSent = true;
//         } else {
//             // Otherwise, return botResponse directly
//             await sendMessageFromMeta(chat.adminId,from,response);
//             response?.isAgent ? null :  sendMessageToAgent(chat.companyId,{type:"messageAdded",message:{userId:chat.userId,message:response,createdOn:new Date().getTime(),isBot:true,isSeen:false},chatId:chat._id}); 
//             messageSent = true; 
//         }

//         if (messageSent && !state.params.isAgentHandover) {
//             await QuotaEngine.deductUsage({
//                 userId: chat.adminId,
//                 featureSlug: 'whatsapp_messages',
//                 amount: 1,
//                 source: 'consumption',
//                 description: `Bot replied via WhatsApp to ${from}`
//             });
//         }

//         //schedulle messages for current chat
//         await scheduleMessages(state.params,"whatsapp");
//         //sending response
//         return res.status(200).send({status:true});
//     }catch(err){
//         console.error(err);
//         return res.status(500).send({status:false});
//     }
// }

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
        if (!payload?.entry?.[0]?.changes?.[0]?.value?.contacts) {
            console.log("webhook status other than recieved");
            return res.status(200).send('OK');
        }

        const entry = payload.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;

        const phoneNumberId = value?.metadata?.phone_number_id;
        const from = value?.contacts?.[0]?.wa_id;
        const message = value?.messages?.[0]?.text?.body;

        if (!message) {
            console.log("No text message body found, skipping.");
            return res.status(200).send('OK');
        }

        // ── Try to find an existing chat ──────────────────────────────────
        let chat = await getWhatsAppChatId(phoneNumberId, from);
        if (!chat) {
            // Also try without leading country-code digits (handles +91xxxxxxxxxx → 10-digit)
            const fromShort = from.length > 10 ? from.slice(-10) : from;
            chat = await getWhatsAppChatId(phoneNumberId, fromShort);
        }

        // ── No existing chat → create lead + chat, then continue ──────────
        if (!chat) {
            console.log(`[webhook] No chat found for phoneNumberId=${phoneNumberId}, from=${from}. Creating new chat.`);

            // Resolve the admin who owns this phoneNumberId
            const adminData = await getAdminByPhoneNumberId(phoneNumberId);
            if (!adminData) {
                console.warn(`[webhook] No admin found for phoneNumberId=${phoneNumberId}. Dropping message.`);
                return res.status(200).send({ status: true });
            }
            const adminId   = String(adminData.id);
            const companyId = String(adminData.companyId);

            // Find or create a lead for this phone number
            const fromShort = from.length > 10 ? from.slice(-10) : from;
            const leadSearchResults = await getLeads({ search: fromShort });
            let leadId: string;
            if (leadSearchResults.length > 0) {
                leadId = String(leadSearchResults[0].id);
                console.log(`[webhook] Found existing lead id=${leadId} for phone=${fromShort}`);
            } else {
                const insertResult = await setLeads({
                    leads: [{
                        name: `WA User ${fromShort}`,
                        phone: fromShort,
                        companyId,
                    }]
                });
                if (!insertResult.success) {
                    console.error("[webhook] Failed to create lead:", insertResult.error);
                    return res.status(200).send({ status: true });
                }
                // setLeads returns { success, result } where result is the insertId (MySQL last_insert_id)
                leadId = String(insertResult.result);
                console.log(`[webhook] Created new lead id=${leadId} for phone=${fromShort}`);
            }

            // Find the admin's WhatsApp subflow (type = '4')
            const waSubFlow = await getWhatsAppSubFlowForAdmin(adminId);
            if (!waSubFlow) {
                console.warn(`[webhook] No WhatsApp subflow found for adminId=${adminId}. Dropping message.`);
                return res.status(200).send({ status: true });
            }

            // Load the subflow data (flowData JSON, bot name/description)
            const { flowData: rawFlowData, botName, botDescription } = await getSubFlowData(String(waSubFlow.id));

            // Determine the starting node
            let currentFlowNodeId: string | number = '1';
            if (rawFlowData && typeof rawFlowData === 'string' && rawFlowData.length > 2) {
                try {
                    currentFlowNodeId = getFirstNodeIdFromFlow(JSON.parse(rawFlowData));
                } catch (_) {
                    currentFlowNodeId = '1';
                }
            }

            // Create the MongoDB chat document
            const newChatId = Math.floor(10000000 + Math.random() * 90000000).toString();
            const newChatData = {
                _id: newChatId,
                companyId,
                userId: leadId,
                adminId,
                userPhone: from,
                flowId: String(waSubFlow.id),
                flowData: rawFlowData || '[]',
                botRole: `${botName || 'Bot'} - ${botDescription || ''}`,
                currentFlowNodeId,
                intents: {},
                isAgentHandover: false,
                isCompleted: false,
                isDeleted: false,
                sentiment: 'proceed',
                channel: 'whatsapp',
                phoneNumberId,
                messages: [],
                createdOn: Math.floor(Date.now() / 1000),
            };

            const created = await createChat(newChatData);
            if (!created) {
                console.error("[webhook] Failed to create chat document.");
                return res.status(200).send({ status: true });
            }

            // Notify agents of the new chat
            sendMessageToAgent(companyId, {
                type: "chatAdded",
                chat: {
                    ...newChatData,
                    userDetails: { name: `WA User ${fromShort}`, email: "NA" },
                    messages: [],
                    unseenMessages: 0,
                }
            });

            // Re-fetch so `chat` has the full Mongoose document shape BotGraph expects
            chat = await getWhatsAppChatId(phoneNumberId, from);
            if (!chat) {
                // Fallback: use a minimal object BotGraph can work with
                chat = {
                    _id: newChatId,
                    companyId,
                    userId: leadId,
                    adminId,
                    flowId: String(waSubFlow.id),
                } as any;
            }

            console.log(`[webhook] New chat created: _id=${newChatId}, leadId=${leadId}, flowId=${waSubFlow.id}`);
        }

        // ── Quota check ───────────────────────────────────────────────────
        const quotaResult = await QuotaEngine.checkQuota(chat.adminId, "whatsapp_messages");
        if (!quotaResult.allowed) {
            console.warn(`WhatsApp quota exhausted for Admin ID: ${chat.adminId}. Dropping bot reply.`);
            return res.status(200).send({ status: true });
        }

        // ── Run BotGraph ──────────────────────────────────────────────────
        const botGraph = new BotGraph();
        const state = await botGraph.processMessage({
            chatId: chat._id,
            message,
            userId: chat.userId,
            companyId: chat.companyId,
            adminId: chat.adminId,
            flowId: chat.flowId,
        }, {});

        const response = state.params.botResponse;

        console.log("----------response in meta webhook -----------------");
        console.log(response);
        console.log("-------------------------------");

        let messageSent = false;

        if (typeof response === 'object') {
            await sendMessageFromMeta(chat.adminId, from, response.message);
            await sendMessageToAgent(chat.companyId, {
                type: "messageAdded",
                message: {
                    userId: chat.userId,
                    message: response.message,
                    createdOn: new Date().getTime(),
                    isBot: true,
                    isSeen: false,
                },
                chatId: chat._id,
            });
            messageSent = true;
        } else {
            await sendMessageFromMeta(chat.adminId, from, response);
            if (!state.params.isAgentHandover) {
                sendMessageToAgent(chat.companyId, {
                    type: "messageAdded",
                    message: {
                        userId: chat.userId,
                        message: response,
                        createdOn: new Date().getTime(),
                        isBot: true,
                        isSeen: false,
                    },
                    chatId: chat._id,
                });
            }
            messageSent = true;
        }

        if (messageSent && !state.params.isAgentHandover) {
            await QuotaEngine.deductUsage({
                userId: chat.adminId,
                featureSlug: 'whatsapp_messages',
                amount: 1,
                source: 'consumption',
                description: `Bot replied via WhatsApp to ${from}`,
            });
        }

        // Schedule follow-up messages if any
        await scheduleMessages(state.params, "whatsapp");

        return res.status(200).send({ status: true });

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

        await QuotaEngine.deductUsage({userId,featureSlug: 'whatsapp_agents',amount: 1,source: 'consumption',description: `Connected WhatsApp agent for WABA: ${waba_id}`});
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
