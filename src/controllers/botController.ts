
import { addMessageForChat , fetchIntentsFromChat , updateNodeId,getOrCreateChat} from '../utils/botMongo';

import {getCurrentFlowNodeDetails , findNextNodeAndUpdate , getMessageToSend, updateChatWithLastUsedNode} from "../utils/botFlow"

import {processGeneralInput, processUserInput} from "../utils/botProcess";

import { Request, Response } from 'express';

import { sendMessageToAgent } from '../utils/eventManager';

import {decryptId} from "../utils/encryptDecrypt";

import {getCompanyIdByFlow} from "../models/flowModel";
import BotGraph from '../utils/botGraph';
import { incrementMessageLedger } from '../models/chats';


const botController=async (message :string,chatId : string, flowId : string,userId:string,companyId:string,ip?:string,userAgent?:string )=>{
    
    try{
        
        const {flowData, currentFlowNodeId,isCompleted,isAgentHandover,channel}= await getOrCreateChat(chatId, flowId,companyId,'2',userId,ip || '',userAgent|| '');


        const {prompt , intents ,currentNodeId, decisionNodes}=await getCurrentFlowNodeDetails(flowData,currentFlowNodeId);

        
        //adding user's message to mongo
        await addMessageForChat(chatId, message,false,currentNodeId);
        
        sendMessageToAgent(companyId,{type:"messageAdded",message:{userId,message,createdOn:new Date().getTime(),isBot:false,isSeen:false},chatId});
        
         //if the agent is handling the chat
         if(isAgentHandover==true){

            return {"message":message,"botResponse":"","isAgent":true};

        }


        //getting all intents - which are to be extracted from message and which are already extracted
        const {filledIntents , emptyIntents}=await fetchIntentsFromChat(chatId,JSON.stringify(intents));
        
      
        

        //if the chat has been completed
        if(isCompleted==true){

            const botResponse=await processGeneralInput(message,JSON.stringify(filledIntents),chatId,channel)
                
            return {botResponse}

        }


       

        
        
        if(Array.isArray(emptyIntents)){


            const gpt=await processUserInput(message,prompt,JSON.stringify(decisionNodes),JSON.stringify(emptyIntents),JSON.stringify(filledIntents),chatId,channel);
            
            
            //checking if all the required intents are captured 
            if(gpt.status==true){
                
                //checking if any intent was updated
                if(gpt.extractedData.updated_intent){

                    const isNodeUpdatedToPrevious=await updateChatWithLastUsedNode(chatId,gpt.extractedData.updated_intent);

                    if(!isNodeUpdatedToPrevious && gpt.nextNode){
                        if(gpt.nextNode){
                            //update currentFlowNodeId
                            await updateNodeId(chatId,parseInt(gpt.nextNode.next_node));
                        }else{
                            //find next node from currentNextNode and then update it
                            await findNextNodeAndUpdate(chatId);
                        }
                    }
                }else{
                    if(gpt.nextNode){
                        //update currentFlowNodeId
                        await updateNodeId(chatId,gpt.nextNode.next_node);
                    }else{
                        //find next node from currentNextNode and then update it
                        await findNextNodeAndUpdate(chatId);
                    }
                }

  
                //sending response
                const botResponse=await getMessageToSend(chatId,JSON.stringify(filledIntents),channel);

                //adding message
                await addMessageForChat(chatId, typeof(botResponse.message)=='object' ? JSON.stringify(botResponse.message) : botResponse.message, true,botResponse.nodeId);
                return {message,botResponse}
            
            }else{  //asking user to fill the required intent

                //checking if any intent was updated
                if(gpt.extractedData?.updated_intent){
                    const isNodeUpdatedToPrevious=await updateChatWithLastUsedNode(chatId,gpt.extractedData.updated_intent);
                    if(isNodeUpdatedToPrevious){
                        //sending response
                        const botResponse=await getMessageToSend(chatId,JSON.stringify(filledIntents),channel);
                        return {"message":message,"botResponse":botResponse};
                    }
                }else{

                    //adding message
                    await addMessageForChat(chatId, typeof(gpt.botResponse) =='object' ? JSON.stringify(gpt.botResponse) : gpt.botResponse, true,currentNodeId);
                    return {"message":message,"botResponse":gpt.botResponse};
                }


                        
            }
            
        
        }else{
            

            // const gpt=await processUserInput(message,prompt,JSON.stringify(decisionNodes),JSON.stringify(emptyIntents),JSON.stringify(filledIntents),chatId);
            //going to next node if exists else giving general response
            const isNextNode=await findNextNodeAndUpdate(chatId);
            
            console.log("------------NEXT NODE-------------");
            console.log(isNextNode);
            console.log("-----------------------------------");
            if(isNextNode.status){
      
                //sending response
                const botResponse=await getMessageToSend(chatId,JSON.stringify(filledIntents),channel);

                console.log("---------BOT RESPONSE----------------");
                console.log(botResponse);
                console.log("---------------------------------");
                //adding message
                await addMessageForChat(chatId, typeof(botResponse.message) =='object' ? JSON.stringify(botResponse.message) : botResponse.message, true,botResponse.nodeId);
                return {message,botResponse}; 
            }else{

            const gpt=await processGeneralInput(message,JSON.stringify(filledIntents),chatId,channel);
            return {"message":message,"botResponse":gpt};

            }
    }

    }catch(err){
        console.log(err);
       return {"botResponse":"I am currently facing some downtime. Please try again"};
    }
        
    
   
}



const sendBotMessage = async (req: Request, res: Response) : Promise<any> => {
    const { message,chatId,encryptedId } = req.body;


    try {

        if (!encryptedId || typeof encryptedId !== 'string') {
            return res.status(400).send({ status: false, message: "Invalid encryptedId" });
        }

        const flowId = decryptId(encryptedId);

        if (flowId === null) {
            return res.status(400).send({ status: false, message: "Invalid ID after decryption" });
        }



        const companyId=await getCompanyIdByFlow(flowId);

        if (!companyId) {
            throw new Error('Company ID not found for flow.');
        }

        const userId =Math.floor(100000 + Math.random() * 900000).toString(); //create a temp userId

        const ip =
            req.headers['x-forwarded-for']?.toString().split(',')[0] || // behind proxy/load balancer
            req.socket.remoteAddress ||                                 // fallback
            '';

        // Get User-Agent
        const userAgent = req.headers['user-agent'] || '';

        const response = await botController(message, chatId, flowId,userId,companyId,ip,userAgent);


        if (typeof (response?.botResponse) === 'object') {
            // If botResponse is an object, return its message property
            sendMessageToAgent(companyId,{type:"messageAdded",message:{userId,message:response.botResponse.message,createdOn:new Date().getTime(),isBot:true,isSeen:false},chatId});
            res.status(200).send({ status: true, message: response.botResponse.message });
            
        } else {
            // Otherwise, return botResponse directly

            response?.isAgent ? null :  sendMessageToAgent(companyId,{type:"messageAdded",message:{userId,message:response?.botResponse,createdOn:new Date().getTime(),isBot:true,isSeen:false},chatId});
            res.status(200).send({ status: true, message: response?.botResponse,isAgent:response?.isAgent });
        }
    } catch (error) {
        console.error("Error sending bot message:", error);
        res.status(500).send({ status: false, message: "I am  facing some downtime. Please try again" });
    }
};




const testGraph=async(req:Request,res:Response):Promise<any>=>{


    try{

        const { message,chatId,encryptedId,subscriptionId } = req.body;
        // const {chatId,message,userId,companyId,flowId}=req.body;

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

        const userId =Math.floor(100000 + Math.random() * 900000).toString(); //create a temp userId

        const ip =
            req.headers['x-forwarded-for']?.toString().split(',')[0] || // behind proxy/load balancer
            req.socket.remoteAddress ||                                 // fallback
            '';

        // Get User-Agent
        const userAgent = req.headers['user-agent'] || '';
        const botGraph=new BotGraph();

        const state=await botGraph.processMessage({chatId,message,userId,companyId,adminId,flowId,ip,userAgent},{});
        
        const response=state.params.botResponse;


        //adding in ledger
        if(state.params.isAgentHandover==false){
            await incrementMessageLedger(adminId,subscriptionId,'chatbot');
        }
         if (typeof (response) === 'object') {
            // If botResponse is an object, return its message property
            sendMessageToAgent(companyId,{type:"messageAdded",message:{userId,message:response.message,createdOn:new Date().getTime(),isBot:true,isSeen:false},chatId});
            return res.status(200).send({ status: true, message: response.message,state });
            
        } else {
            // Otherwise, return botResponse directly

            response?.isAgent ? null :  sendMessageToAgent(companyId,{type:"messageAdded",message:{userId,message:response,createdOn:new Date().getTime(),isBot:true,isSeen:false},chatId});
            return res.status(200).send({ status: true, message: response,isAgent:state.params.isAgentHandover});
        }



    }catch(err){
        console.error("An error occured while testing bot graph : ",err);

        return res.status(500).send({status:false,message:"Unable to test now."});
    }
}

export {botController,testGraph,sendBotMessage};

// const sendMetaMessage=async(customerPhone:string,message:string)=>{

//     //getting userId and chatId and flowId
//     const {chatId,flowId,phoneNumberId,wabaId}=await getChatAndFlow(customerPhone);
    
    

//     const response=await botController(message,chatId,flowId);

//     console.log("final response :",response?.botResponse);

//     //checking for template
//     if(response?.botResponse?.type=='metaTemplate'){
//         //send template message

//         const isMessageSent=await sendTemplate(response.botResponse.message,customerPhone,phoneNumberId,wabaId);

//         if(isMessageSent){
//             console.log("Template Message sent");
//         }else{
//             console.log("some error occured while sending message");
//         }
        
//     }else if (response?.botResponse?.type=='interactive'){

//         //send interactive message

//         const isMessageSent=await sendInteractive(response.botResponse.message,customerPhone,phoneNumberId,wabaId);
        
//         if(isMessageSent){
//             console.log("Interactive Message sent");
//         }else{
//             console.log("some error occured while sending message");
//         }
//     }else{

//          //send message to meta
       
//         const messageToSend=typeof(response?.botResponse)=='object' ? response.botResponse.message : response?.botResponse;

//         const isMessageSent=await sendSessionMessages(customerPhone,'text',messageToSend || 'We are facing some downtime, try again',phoneNumberId,'whatsapp','INDIVIDUAL',wabaId);

//         if(isMessageSent){
//             console.log("Text Message sent");
//         }else{
//             console.log("some error occured while sending message");
//         }
//     }
   
// }
// export default sendMetaMessage;
