import { fetchMessagesForChat, addMessageForChat , updateChatIntentStore, updateChatForAgent , updateChatForRestart, getCurrentFlowData,updateChatSentiment,getBotRole,getVectorNamespace} from './botMongo';
import {extractData  , decideNextNode, getUserSentiment} from "./botUtilPrompt"

import {getFirstNodeIdFromFlow} from './botFlow';

import {getFaqContext} from "./faqContext";

import { getMissingDataMessage,generateResponse,sendQueryResponse } from './botInteractPrompt';


async function handleProceedOrUpdateData(sentiment:string,input:string,prompt:string,variables:string,filledIntents:string,context:any,decisionNodes:string,chatId:string,channel:string):Promise<any>{

  const extractedData=JSON.parse(await extractData(input,prompt,variables,filledIntents,context,sentiment =="update_data" ? true : false));


  console.log("---------------------------------------Extracted data below----------------------------------");
  console.log(extractedData);
  console.log("--------------------------------------------------------------------------------------------------------")

  if(extractedData.status=='true' || extractedData.status==true){

    console.log("extracted data is true");
      const res: { [key: string]: any } = { extractedData };
  
        delete extractedData.message;
        delete extractedData.status;
        
        // Update the chat intent store with the cleaned data
        await updateChatIntentStore(chatId, extractedData as { [key: string]: string | number | Date | boolean });
        
        // If decision nodes are present, decide the next node
        const parsedDecisionNodes = JSON.parse(decisionNodes);
        
        if (Array.isArray(parsedDecisionNodes) && parsedDecisionNodes.length !== 0) {
            const nextNode = JSON.parse(await decideNextNode(decisionNodes,JSON.stringify({...extractedData,...JSON.parse(filledIntents)})));
        
            res['nextNode'] = nextNode;
        }
  
        res['status']=true;
        return res;
  }else{

    

    const botRole=await getBotRole(chatId);

    const botResponse=JSON.parse(await getMissingDataMessage(extractedData.missingFields,context,filledIntents,botRole,channel));

    const res={botResponse:botResponse.message,extractedData,status:false};

    delete extractedData.status;
    delete extractedData.message;

    //check if there are multiple intents to capture
    if(JSON.parse(variables).length>0 && Object.keys(extractedData).some(key => key !== 'status')){
    
      //updating intent store
      await updateChatIntentStore(chatId, extractedData as { [key: string]: string | number | Date | boolean });
        
    }

    return res;
  }
}



async function handleOffTopic(input:string,prompt:string,variables:string,filledIntents:string,context:any,chatId:string,decisionNodes:string,channel:string):Promise<any>{
    
  //extracting missing data message
  const extractedData = JSON.parse(await extractData(input,prompt,variables,filledIntents,context,false));

  if(extractedData.status=='false'){

    if(JSON.parse(variables).length>0 && Object.keys(extractedData).some(key => key !== 'status' && key!=='message')){
    
      //updating intent store
      await updateChatIntentStore(chatId, extractedData as { [key: string]: string | number | Date | boolean });
        
    }


    const botRole=await getBotRole(chatId);
    const botResponse = JSON.parse(await getMissingDataMessage(extractedData.missingFields,context,filledIntents,botRole,channel));
    return {status:false,extractedData,botResponse:botResponse.message}
  }

  
  console.log("extracted data is true");

  const res: { [key: string]: any } = { extractedData };
  
        // Remove unnecessary fields
        delete extractedData.status;
        delete extractedData.message;
        
        // Update the chat intent store with the cleaned data
        await updateChatIntentStore(chatId, extractedData as { [key: string]: string | number | Date | boolean });
        
        // If decision nodes are present, decide the next node
        const parsedDecisionNodes = JSON.parse(decisionNodes);
        
        if (Array.isArray(parsedDecisionNodes) && parsedDecisionNodes.length !== 0) {
            const nextNode = JSON.parse(await decideNextNode(decisionNodes,JSON.stringify({...extractedData,...JSON.parse(filledIntents)})));
        
            res['nextNode'] = nextNode;
        }
  
        res['status']=true;
        return res;

  }


async function handleQuery(input:string,filledIntents:string,chatId:string,channel:string):Promise<any>{


  const botRole=await getBotRole(chatId);

  const {vectorNamespace,flowId}=await getVectorNamespace(chatId);

  const chatContext = await fetchMessagesForChat(chatId);
  
  const faqContext=await getFaqContext(input,vectorNamespace,flowId);

  
  
  const botResponse = JSON.parse(await sendQueryResponse(input,faqContext,filledIntents,botRole,chatContext,channel));

  // if(botResponse.out_of_bound && botResponse.out_of_bound==true){
  //   await setOutOfBound(chatDocRef,input);
  // }

  if(!botResponse.message){
    return {status:false,extractData:{},botResponse:{message:botResponse,type:'interactive'}}
  }
  
  return {status:false,extractedData:{},botResponse:botResponse}


}


async function handleAgentHandover(chatId : string){
  
  //updating chat document
  await updateChatForAgent(chatId);
  
  return {status : false,extractedData:{},botResponse : "I have forwarded this chat to an expert agent of mine. They will contact you shortly to resolve your queries.\nRegards"}
}



async function handleRestart(chatId:string){


  //getting starting flow id
  const {flowDocData} = await getCurrentFlowData(chatId);

  const flow=flowDocData.flowData;

  const startingNodeId = getFirstNodeIdFromFlow(flow);
  //updating chat document
  await updateChatForRestart(chatId,startingNodeId);

  return {status:false,extractedData:{},botResponse :"Sure, I have restarted the entire flow. Let's start again."}
}



async function processUserInput(input: string, prompt : string ,decisionNodes:string,variables:string,filledIntents:string, chatId: string,channel:string): Promise<any> {
  
    const context = await fetchMessagesForChat(chatId);


    const sentiment=JSON.parse(await getUserSentiment(context,filledIntents,variables));

    console.log("-----------------------Sentiment Below-------------------------");
    console.log(sentiment);

    
    //storing sentiment in DB
    await updateChatSentiment(chatId,sentiment.sentiment);

    //moving ahead by sentiment
    switch(sentiment.sentiment){

      case "proceed":  
      case "update_data":

        return await handleProceedOrUpdateData(sentiment.sentiment,input, prompt, variables, filledIntents, context, decisionNodes, chatId,channel);


      case "off_topic": 
        
        return await handleOffTopic(input, prompt, variables, filledIntents, context,chatId,decisionNodes,channel);
      
      case "general_query":

      return await handleQuery(input,filledIntents,chatId,channel);
      case "stop":

        return {status:false,extractedData : {},botResponse:"It seems like this is not a good time to talk, I do understand. If you have any more queries or you would want to talk do come back again.\n Regards"}

    
      case "agent_handover":
        return await handleAgentHandover(chatId);


      case "restart":
        return await handleRestart(chatId);
    }
    
   

    
   
    

    
}


async function processGeneralInput(input: string, filledIntents: string, chatId: string,channel:string): Promise<string | any> {
  try {

    // Fetching chat context
    const chatContext = await fetchMessagesForChat(chatId);

    //check for sentiment
    // const userSentiment=await JSON.parse(await getUserSentiment(input,context,filledIntents));
    
    // Providing general response
    const botRole=await getBotRole(chatId);

    
    //storing sentiment in DB
    await updateChatSentiment(chatId,'general_query');

    // if(userSentiment.sentiment=='general_query'){
            
          //Always take context from FAQ only
            const {vectorNamespace,flowId}=await getVectorNamespace(chatId);
            const faqContext=await getFaqContext(input,vectorNamespace,flowId);

            const botResponse = JSON.parse(await sendQueryResponse(input,faqContext,filledIntents,botRole,chatContext,channel));
            
            // if(botResponse.out_of_bound && botResponse.out_of_bound==true){
            //   await setOutOfBound(chatDocRef,input);
            // }
          
            // Adding bot response to the chat
            await addMessageForChat(chatId, botResponse.message ? botResponse.message : JSON.stringify(botResponse), true,-1);
            if(!botResponse.message){

              return {message:botResponse,type:'interactive'}
            }

            return botResponse


            
           

        
    // }else{

    //   const botResponse = await generateResponse(input, filledIntents, context,botRole);

    //   // Adding bot response to the chat
    //   await addMessageForChat(chatDocRef, botResponse, true,-1);

    //   return botResponse; // Return the bot response
    // }
    
  } catch (error) {
    console.error("Error processing general input:", error);
    throw new Error("Failed to process input");
  }
}


export {processUserInput , processGeneralInput };
