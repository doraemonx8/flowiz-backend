import {StateGraph} from "@langchain/langgraph";
import { addMessageForChat, fetchIntentsFromChat, fetchMessagesForChat, getBotRole, getCurrentFlowData, getOrCreateChat, getVectorNamespace, updateChatForAgent, updateChatForRestart, updateChatIntentStore, updateChatSentiment, updateNodeId } from "./botMongo";
import { sendMessageToAgent } from "./eventManager";
import { findNextNodeAndUpdate, getCurrentFlowNodeDetails, getFirstNodeIdFromFlow, getMessageToSend, updateChatWithLastUsedNode } from "./botFlow";
import { decideNextNode, extractData, getUserSentiment } from "./botUtilPrompt";
import { getFaqContext } from "./faqContext";
import { getMissingDataMessage, sendQueryResponse } from "./botInteractPrompt";




interface FlowData{

    message:string;
    chatId:string;
    adminId:string;
    flowId:string;
    userId:string;
    companyId:string;
    ip?:string;
    userAgent?:string;
}


interface WorkflowState {
  params: {
    isAgentHandover?: boolean;
    isCompleted?:boolean;
    emptyIntents?: any[];
    sentiment?: string;
    extractedData?: { status?: boolean };
    message:string;
    chatId:string;
    flowId:string;
    userId:string;
    companyId:string;
    ip?:string;
    userAgent?:string;

  };
}



// Define transitions in one place
const transitions: Record<string,(state: WorkflowState) => string | undefined> = {
  init: (state) => {
    if (state.params.isAgentHandover) return "agentHandover";
    if (state.params.isCompleted) return "generalResponse";
    if (Array.isArray(state.params.emptyIntents) && state.params.emptyIntents.length) {
      return "analyzeSentiment";
    }
    return "generalResponse"; 
  },

  analyzeSentiment: (state) => {
    switch (state.params.sentiment) {
      case "proceed":
      case "update_data":
        return "extractData";
      case "off_topic":
        return "offTopic";
      case "general_query":
        return "query";
      case "stop":
        return "stop";
      case "restart":
        return "restart";
      case "agent_handover":
        return "agentHandover";
      default:
        return "generalResponse"; 
    }
  },

  extractData: (state) => {
    if (state.params.extractedData?.status==true && state.params.sentiment !== "update_data") {
      return "sendMessage";
    } else if (state.params.sentiment === "update_data") {
      return "update";
    }
    return "missingRequiredFields";
  },
};

class BotGraph{
   workflow: any;
    compiled: any;

   constructor(){

    this.workflow=new StateGraph({
        channels:<any>{

            params:{
                value: (prev : any, next:any) => ({ ...prev, ...next }),
                default: () => ({}),
            }
        }
    });


    this._buildWorkflow();
   }


   _buildWorkflow(){

    // Register nodes
    this.workflow.addNode("init", this._handleInit.bind(this));
    this.workflow.addNode("analyzeSentiment", this._analyzeSentiment.bind(this));
    // this.workflow.addNode("offTopic", this._handleOffTopic.bind(this)); not being used
    this.workflow.addNode("agentHandover", this._handleAgentHandover.bind(this));
    this.workflow.addNode("query", this._handleQuery.bind(this));
    this.workflow.addNode("restart", this._handleRestart.bind(this));
    this.workflow.addNode("update", this._handleUpdate.bind(this));
    this.workflow.addNode("extractData", this._extractData.bind(this));
    this.workflow.addNode("missingRequiredFields", this._handleMissingFields.bind(this));
    this.workflow.addNode("stop", this._handleStop.bind(this));
    this.workflow.addNode("generalResponse", this._handleGeneral.bind(this));
    this.workflow.addNode("sendMessage", this._sendMessage.bind(this));

    // Register edges
    this.workflow.addEdge("__start__", "init");
    this.workflow.addEdge("update", "sendMessage");

    // Dynamically add conditional edges from transition map
    Object.entries(transitions).forEach(([node, fn]) => {
    this.workflow.addConditionalEdges(node, fn);
    });


   this.compiled = this.workflow.compile();

   }



   async _handleInit(state : any){

    try{

        const start=performance.now();

        const {chatId,flowId,companyId,adminId,userId,ip,userAgent,message}=state.params;

        const {flowData, currentFlowNodeId,isCompleted,isAgentHandover,channel}= await getOrCreateChat(chatId,flowId,companyId,adminId,userId,ip || '',userAgent|| '');

        const {prompt , intents ,currentNodeId, decisionNodes}=await getCurrentFlowNodeDetails(flowData,currentFlowNodeId);

        const {filledIntents , emptyIntents}=await fetchIntentsFromChat(chatId,JSON.stringify(intents));
        //adding user's message to mongo
        await addMessageForChat(chatId,message,false,currentNodeId);
        
        sendMessageToAgent(companyId,{type:"messageAdded",message:{userId,message:message,createdOn:new Date().getTime(),isBot:false,isSeen:false},chatId :chatId});
        


        const context = await fetchMessagesForChat(chatId);
        const end=performance.now();

        console.log(`Time taken on init node : ${(end-start).toFixed(2)}`);

        //cleaning up ids from empty intents
        emptyIntents.forEach((intent)=>{

            delete intent.id;
        })

        return {
            params:{flowData,isCompleted,channel,isAgentHandover,prompt,intents,decisionNodes,currentNodeId,filledIntents,emptyIntents,context}
        }

    }catch(err : any){

        console.error("erro in init flow node : ",err.message);
    }
   }


   async _analyzeSentiment(state:any){

    try{

        const start=performance.now();


        const {context,filledIntents,emptyIntents}=state.params;


        const sentiment=JSON.parse(await getUserSentiment(context,filledIntents,JSON.stringify(emptyIntents)));

        console.log("-----------------------Sentiment Below-------------------------");
        console.log(sentiment);

        
        //storing sentiment in DB
        await updateChatSentiment(state.params.chatId,sentiment.sentiment);
        const end=performance.now();

        console.log(`Time taken in analyze sentiment : ${(end-start).toFixed(2)}`);

        return {
            params:{sentiment:sentiment.sentiment}
        }
    }catch(err){
        console.error("an error occured in analyze sentiment node : ",err);
    }
   }
   
   async _handleAgentHandover(state:any){

        try{

            const start=performance.now();

            const {chatId,isAgentHandover,currentNodeId}=state.params;

            //updating chat
            if(!isAgentHandover){
                await updateChatForAgent(chatId);
            }
            
            const end=performance.now();

            console.log(`Time taken in agent handover : ${(end-start).toFixed(2)}`);

            const botResponse={message:"I have forwaded this chat to an expert agent of mine. They will contact you shortly.\nRegards"};


            await addMessageForChat(chatId, botResponse.message, true,currentNodeId);
        
            return {params:{botResponse}};
        }catch(err){
            console.error("an error occured in agent handover node : ",err);
        }
   }



   async _handleQuery(state:any){

        try{

            const start=performance.now();
            const {chatId,message,filledIntents,channel,context}=state.params;
            const botRole=await getBotRole(state.params.chatId);

            const {vectorNamespace,flowId}=await getVectorNamespace(chatId);

            
            const faqContext=await getFaqContext(message,vectorNamespace,flowId);


            const botResponse = JSON.parse(await sendQueryResponse(message,faqContext,filledIntents,botRole,JSON.stringify(context),channel));

            const end=performance.now();

            console.log(`Time taken in query : ${(end-start).toFixed(2)}`);

            return {
                params:{botResponse}
            }
            
        }catch(err){
            console.error("An error occured in query node :  ",err)
        }
   }


   async _handleRestart(state:any){

    try{

        const start=performance.now();

        const {chatId}=state.params;
        
        //getting starting flow id
        const {flowDocData} = await getCurrentFlowData(chatId);

        const flow=flowDocData.flowData;

        const startingNodeId = getFirstNodeIdFromFlow(flow);
        //updating chat document
        await updateChatForRestart(chatId,startingNodeId);

        const end=performance.now();

        console.log(`Time taken restart : ${(end-start).toFixed(2)}`);

        return {
            params:{botResponse:"Sure, I have restarted the entire flow. Let's start again"}
        }

    }catch(err){

        console.error("an error occured in restart node : ",err);
    }
   }



   async _handleStop(){

    try{

        return {
            params:{botResponse:"It seems like this is not a good time to talk, I do understand. If you have any more queries or you would want to talk do come back again.\n Regards"}
        }
    }catch(err){

        console.error("an error occured in stop node : ",err);
    }
   }
   


   async _handleGeneral(state:any){

    try{

        const start=performance.now();

        const {chatId,message,filledIntents,context,channel}=state.params;

        
        // Providing general response
        const botRole=await getBotRole(chatId);

        
        //storing sentiment in DB
        await updateChatSentiment(chatId,'general_query');


                
        //Always take context from FAQ only
        const {vectorNamespace,flowId}=await getVectorNamespace(chatId);
        const faqContext=await getFaqContext(message,vectorNamespace,flowId);

        const botResponse = JSON.parse(await sendQueryResponse(message,faqContext,filledIntents,botRole,JSON.stringify(context),channel));

        // Adding bot response to the chat
        await addMessageForChat(chatId, botResponse.message ? botResponse.message : JSON.stringify(botResponse), true,-1);
        

        const end=performance.now();

        console.log(`Time taken in general node : ${(end-start).toFixed(2)}`);
        return {
            params:{botResponse}
        }

    }catch(err){
        console.error("an error occured in general node : ",err);
    }
   }


   async _extractData(state:any){

        try{    

            const start=performance.now();
            const {message,prompt,emptyIntents,context,filledIntents}=state.params;


            const extractedData=JSON.parse(await extractData(message,prompt,JSON.stringify(emptyIntents),JSON.stringify(filledIntents),context,false));


            console.log("---------------------------------------Extracted data below----------------------------------");
            console.log(extractedData);
            console.log("--------------------------------------------------------------------------------------------------------")

            const end=performance.now();

            console.log(`Time taken in extracting data : ${(end-start).toFixed(2)}`);

            return {
                params:{extractedData}
            }
        }catch(err){
            console.error("an error occured in proceed node : ",err);
        }
   }



   async _handleMissingFields(state:any){

    try{

        const start=performance.now();

        const {chatId,extractedData,context,filledIntents,currentNodeId,channel}=state.params;
        const botRole=await getBotRole(chatId);

        const botResponse=JSON.parse(await getMissingDataMessage(JSON.stringify(extractedData.missingFields),JSON.stringify(context),filledIntents,botRole,channel));

        // const res={botResponse:botResponse.message,extractedData,status:false};

        delete extractedData.status;

        // //check if there are multiple intents to capture
        // if(JSON.parse(emptyIntents).length>0 && Object.keys(extractedData).some(key => key !== 'status')){
        
        // //updating intent store
        // await updateChatIntentStore(chatId, extractedData as { [key: string]: string | number | Date | boolean });
        
        // await addMessageForChat(chatId, typeof(botResponse) =='object' ? JSON.stringify(botResponse) : botResponse, true,currentNodeId);
        
        // }

        await addMessageForChat(chatId, typeof(botResponse) =='object' ? botResponse.message : botResponse, true,currentNodeId);
        const end=performance.now();

        console.log(`Time taken in missing fields : ${(end-start).toFixed(2)}`)
        return {
            params:{botResponse}
        }
    }catch(err){

        console.error("an error occured in missing fields node : ",err);
    }
   }


   async _sendMessage(state:any){

    try{

        const start=performance.now();


        const {extractedData,chatId,decisionNodes,filledIntents,channel}=state.params;

        const res: { [key: string]: any } = { extractedData };
    
        delete extractedData.status;
        // Update the chat intent store with the cleaned data
        await updateChatIntentStore(chatId, extractedData as { [key: string]: string | number | Date | boolean });
        
        // If decision nodes are present, decide the next node
        // const parsedDecisionNodes = JSON.parse(decisionNodes);
        
        if (Array.isArray(decisionNodes) && decisionNodes.length !== 0) {
            const nextNode = JSON.parse(await decideNextNode(JSON.stringify(decisionNodes),JSON.stringify({...extractedData,...filledIntents})));
        
            await updateNodeId(chatId,nextNode.next_node);
        }

        await findNextNodeAndUpdate(chatId);


        //sending response
        const botResponse=await getMessageToSend(chatId,JSON.stringify(filledIntents),channel);

        //adding message
        await addMessageForChat(chatId, typeof(botResponse.message)=='object' ? JSON.stringify(botResponse.message) : botResponse.message, true,botResponse.nodeId);
        

        const end=performance.now();

        console.log(`Time taken in sending message : ${(end-start).toFixed(2)}`);
        return {
            params:{botResponse}
        }

    

    }catch(err){
        console.error("an error occured in send message node : ",err);
    }
   }


   async _handleUpdate(state:any){

    try{

        const {chatId,extractedData,nextNode}=state.params;


        const isNodeUpdatedToPrevious=await updateChatWithLastUsedNode(chatId,extractedData.updated_intent);

        if(!isNodeUpdatedToPrevious && nextNode){
            if(nextNode){
                //update currentFlowNodeId
                await updateNodeId(chatId,parseInt(nextNode.next_node));
            }else{
                //find next node from currentNextNode and then update it
                await findNextNodeAndUpdate(chatId);
            }
        }

        return;
    }catch(err){
        console.error("an error occured while handling update");
    }
   }

   
   async processMessage(data:FlowData,state:any){

        state.params=data;
        // Run workflow with current state
        const newState = await this.compiled.invoke(state);
        return newState;
   }

}



export default BotGraph;