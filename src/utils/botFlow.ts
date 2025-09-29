import {getCurrentFlowData , updateNodeId , fetchIntentsFromChat , fetchMessagesForChat,updateChatIntentStore,getBotRole, updateChatForAgent} from './botMongo';

import {decideNextNode} from "./botUtilPrompt";

import { getCustomMessage, sendText } from './botInteractPrompt';



function replaceSpacesInVariables(text : string) {

    console.log("------------------------replacing spaces below-------------------")
    console.log(text);
    return text.replace(/{{([^}]+)}}/g, (match, p1) => {
        return `{{${p1.replace(/\s+/g, '_')}}}`;
    });

}


function replaceVariablesInText(text: string, variables: any) {
    // Regular expression to match variables inside double curly braces
    const regex = /{{\s*([^}]+?)\s*}}/g;

    // Replace function
    return text.replace(regex, (match, variableName) => {
        // Trim any whitespace from the variable name
        const trimmedVariable = variableName.trim();
        // Return the value from the variables object or the original match if not found
        return Object.prototype.hasOwnProperty.call(variables, trimmedVariable)
            ? variables[trimmedVariable]
            : match;
    });
}




async function getTemplateMessage(chatDocRef:any,values:any,name:string,language:string){

    //creating components JSON
    const components:any=[]

    const {filledIntents }=await fetchIntentsFromChat(chatDocRef,'[]'); //to fill variable values

    //looping over values
    Object.keys(values).forEach((componentType:string)=>{
        const parameters : any=[]
       
        //filling parameters
        const typeObj=values[componentType]
        
        Object.values(typeObj).forEach((value:any)=>{
            const type="text";
            const text=replaceVariablesInText(replaceSpacesInVariables(value),filledIntents);

            parameters.push({type,text});
        });

        components.push({type:componentType,parameters});
    });


    //constructing final JSON
    return JSON.stringify({name,language:{code:language},components})

}


async function getInteractiveMessage(message:string,interactiveMessageJSON:any){

    interactiveMessageJSON['body']['text']=message;

    return JSON.stringify(interactiveMessageJSON);
}

function collectIntentsUptoNode(targetNodeId:number,flowData:any,filledIntents:{[key : string] : string | number | Date | boolean},startNodeId:number){

    const updatedIntents: { [key: string]: string | number | Date | boolean } = {};
    const visited = new Set<string | number>();

    function dfs(nodeId: number): boolean {
        if (visited.has(nodeId)) return false;
        visited.add(nodeId);

        const node = flowData.find((n : any) => n.id === nodeId);
        if (!node) return false;

        // Collect intents for this node
        if (node.data && node.data.fields) {
            node.data.fields.forEach((intentObj: { intent: string }) => {
                if (filledIntents[intentObj.intent]) {
                    updatedIntents[intentObj.intent] = filledIntents[intentObj.intent];
                }
            });
        }

        // Check if we've reached the target node
        if (nodeId === targetNodeId) {
            return true;
        }

        // Continue to next nodes
        if (node.next) {
            for (const nextNodeId of node.next) {
                if (dfs(nextNodeId)) return true;
            }
        }

        return false;
    }

    dfs(startNodeId);
    return updatedIntents;

}


function getFirstNodeIdFromFlow(flowData:any) : string{

    for (const node of flowData){

        if(node.data.isFirst){
            return node.id;
        }
    }


    return "1";
}

interface Node{

    id:string,
    type:string,
    data:Record<string,any>,
    next:Array<string>
}

async function getCurrentFlowNodeDetails(flowData : string,currentFlowNodeId:string | number):Promise<{type : string, prompt: string, intents: Array<{[key : string] : string}>,currentNodeId:number | string, decisionNodes: Array<{[key : string] : string}> }>{

    try{

        // const {flowData, currentFlowNodeId,isCompleted,isAgentHandover} = await getCurrentFlowData(chatId);
        
        const flow=JSON.parse(flowData);

        if(currentFlowNodeId==-1){
            return {type : "null",prompt :"null" , intents :[] ,currentNodeId:-1, decisionNodes : []};
        }

        //finding current node details
        const node=flow.filter((node : Node)=> node.id===currentFlowNodeId)[0];

        const decisionNodes : Array<{[key : string] : string}>=[];

        //checking if the next nodes of the current node are of type decision & getting them
        if(node.next && node.next.length>1){
            node.next.forEach((id : string)=>{

                const decisionNode=flow.filter((node : Node) => node.id ===id)[0];

                if(decisionNode.type=='decisionNode'){
                    
                    const santizedDecisionContent = replaceSpacesInVariables(decisionNode.data.content);
                    // decisionNodes.push({checkFor, next : decisionNode.next[0]});
                    decisionNodes.push({checkFor: santizedDecisionContent, next : decisionNode.next[0]});
                }
                
            })
        };

        return {type : node.type, prompt : node.data.prompt , intents : node.data.intents || [],currentNodeId:currentFlowNodeId,decisionNodes};
    }catch(err){

        console.error("Error getting node details",err);
        return {type : "null",prompt :"null" , intents :[] ,currentNodeId:-1, decisionNodes : []};
    }
}


async function findNextNodeAndUpdate(chatId : string){
    try{

        const {flowData , currentFlowNodeId} = await getCurrentFlowData(chatId);

        const flow=JSON.parse(flowData);

        if(currentFlowNodeId ==-1){
            return {"status":false}
        }
        //finding current node details
        const node=flow.filter((obj : { [key: string]: string })=>{return obj.id==currentFlowNodeId})[0];

        //checking if the next nodes exist
        if(node.next && node.next.length>=1){

            //checking if next nodes are of type decision and then deciding the next flow
            if(node.next.length > 1){

                const decisionNodes:Array<any>=[];
                
                const {filledIntents}=await fetchIntentsFromChat(chatId,'[]');

                node.next.forEach((id : string)=>{

                    const decisionNode=flow.filter((obj : {[key : string] : string})=>{return obj.id==id})[0];
                    const checkFor = replaceSpacesInVariables(decisionNode.data.content);
                    decisionNodes.push({checkFor, next : decisionNode.next[0]});
                })
                const nextNode = JSON.parse(await decideNextNode(JSON.stringify(decisionNodes),JSON.stringify(filledIntents)));

                if(nextNode.status=='true'){

                    await updateNodeId(chatId,nextNode.next_node);
                    return {"status":true};

                }else{
                    await updateNodeId(chatId,node.id);
                    return {"status":true};
                }
            
            }else{

                await updateNodeId(chatId,node.next[0]);
                return {"status":true};

            }
            
        
        }else{ //reached last node of the flow

            //if the last node is of type agent handover then current node Id remains same else goes into general convo
            if(node.type=="Agent"){
                
            await updateNodeId(chatId,currentFlowNodeId,true);
            return {"status" :true};
            }else{
                await updateNodeId(chatId,currentFlowNodeId,true);
                return {"status" :false};
            }
            
        }

    }catch(err){

        console.error("Error getting node details",err);
        return {"status":false};
    }
}


async function getMessageToSend(chatId :string,intents:string,channel:string) : Promise<{[key : string] : any}>{
    try{

        const {flowData , currentFlowNodeId} = await getCurrentFlowData(chatId);
        const flow=JSON.parse(flowData);
        

        //finding current node details
        const node=flow.filter((obj : { [key: string]: string })=>{return obj.id==currentFlowNodeId})[0];

        //checking if it is last node
        if(node && node.data.isLast){
            //marking chat as completed
            updateNodeId(chatId,currentFlowNodeId,true); //not awaiting

        }

        if(node){

            let botResponse: { message: any; isTemplate?: any; isInteractive?: any; };
            //checking for meta template node
            if(node.data.type==="template" && node.type==="whatsappNode"){

                const templateMessage=await getTemplateMessage(chatId,node.data.inputValues,JSON.parse(node.data.metaTemplate).name,JSON.parse(node.data.metaTemplate).language);

                botResponse={isTemplate:true,message:templateMessage};
            }else if(node.data.templateType=='Interactive'){


                const context= await fetchMessagesForChat(chatId);

                const botRole=await getBotRole(chatId);

                
                //checking if any variable is present in body of interactive message
                if(/\[.*?\]/.test(node.data.interactiveMessage.body.text)){

                    //getting all intents - which are to be extracted from message and which are already extracted
                    const {filledIntents }=await fetchIntentsFromChat(chatId,'[]');
                    
                    botResponse=JSON.parse(await getCustomMessage(replaceSpacesInVariables(node.data.interactiveMessage.body.text),JSON.stringify(filledIntents),context,channel));

                }else{

                    botResponse=JSON.parse(await sendText(node.data.interactiveMessage.body.text,context,intents,node.data.text || '',botRole,channel));

                }
                
                const interactiveMessage=await getInteractiveMessage(botResponse.message,node.data.interactiveMessage);

                console.log("got interactive message")
                console.log(interactiveMessage);
                botResponse={isInteractive:true,message:interactiveMessage};
                

            }else{
                const context= await fetchMessagesForChat(chatId);

                //checking if any variable is present
                if(/\[.*?\]/.test(node.data.content)){

                    
                    //getting all intents - which are to be extracted from message and which are already extracted
                    const {filledIntents}=await fetchIntentsFromChat(chatId,'[]');


                    botResponse=JSON.parse(await getCustomMessage(replaceSpacesInVariables(node.data.content),JSON.stringify(filledIntents),context,channel));


                }else{

                    const botRole=await getBotRole(chatId);

                    botResponse=JSON.parse(await sendText(node.data.content,context,intents,node.data.prompt || '',botRole,channel));
                }
            }
            
            
            return {type : botResponse?.isTemplate? "metaTemplate":(botResponse?.isInteractive ? 'interactive':node.type), message:botResponse.message, nodeId:currentFlowNodeId};
        }else if (node && node.type=='Agent'){

            //marking chat as completed
            await updateNodeId(chatId,currentFlowNodeId,true);
            //sending response
            return {type : node.type,message : "I have forwarded this chat to an expert agent of mine. They will contact you shortly to resolve your queries, meanwhile feel free to ask any questions that you have in mind.\nRegards",nodeId:currentFlowNodeId}
        }

        return {}

    }catch(err){
        console.error("error getting response message",err);
        return {}
    }
}


async function updateChatWithLastUsedNode(chatId: string, intent: string): Promise<boolean> {
    try {


        // Getting flow data
        const { flowData, currentFlowNodeId } = await getCurrentFlowData(chatId);
        const flow = flowData;

        let intentFound = false;
        let nodeId=currentFlowNodeId;
        let startingNodeId=-1;

        for (const node of flow) {
            if (node.data.fields) {
                const isRequired = node.data.intents.some((intentObj: { [key: string]: string | boolean }) => {
                    return intentObj.name === intent && intentObj.required === true;
                });
                if (isRequired) {
                    intentFound = true;
                    break; // Exit the loop as we found the required intent
                }
            }
        }
        
        // If the intent was found, search for the next decision node that uses this intent

        const decisionNodes : Array<{[key : string] : string}>=[];

        if (intentFound) {
            for (const node of flow) {
                if (node.type === 'decision' && 
                    node.data && 
                    node.data.value && 
                    replaceSpacesInVariables(node.data.content).includes(intent)) {
                    nodeId = parseInt(node.id);
                    const checkFor = replaceSpacesInVariables(node.data.content);
                    decisionNodes.push({checkFor, next : node.next[0]});
                    
                }


                if(node.data.isFirstNode){
                    startingNodeId=parseInt(node.id);
                }
            }
        }


        

        console.log("-----------------Decision nodes after updated intent-------------------------");
        console.log(decisionNodes);
        //now if the intent was being used in some decision then reevaluate that decision
        if(decisionNodes.length > 0){

            const {filledIntents}=await fetchIntentsFromChat(chatId,'[]');
            const nextNode = JSON.parse(await decideNextNode(JSON.stringify(decisionNodes),JSON.stringify(filledIntents)));

            //if the next node is now decided then check its path if it again leads to the same decision
            if(nextNode.status=='true'){
                nodeId=parseInt(nextNode.next_node);
            }

        }
        
        
        

        // Updating chat flow nodeId pointer and removing captured intents
        if (nodeId !== currentFlowNodeId) {
            await updateNodeId(chatId, nodeId);

            //removing all the intents captured after the node to which the current node pointer has been reset.
            const {filledIntents} : {filledIntents : any} = await fetchIntentsFromChat(chatId,'[]');
            // Retain intents up to the updated nodeId
            for (const node of flow) {

                if(parseInt(node.id)!=nodeId && node.data.intents){
                    node.data.fields.forEach((intentObj : {[key : string] : string})=>{

                        if(filledIntents[intentObj.name]){
                            updatedIntents[intentObj.name]=filledIntents[intentObj.name];
                        }
                       
                    })
                }
            }

            const updatedIntents=collectIntentsUptoNode(nodeId,flow,filledIntents,startingNodeId);
            updatedIntents[intent]=filledIntents[intent];

            // Update the chat document with the filtered intents
            await updateChatIntentStore(chatId,  updatedIntents);

            return true;
        }
        return false;
    } catch (err) {
        console.error("Error while updating chat node ID when intent was changed", err);
        return false;
    }
}




export {getCurrentFlowNodeDetails , findNextNodeAndUpdate , getMessageToSend,updateChatWithLastUsedNode , getFirstNodeIdFromFlow}
