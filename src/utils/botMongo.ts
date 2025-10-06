import Chat from '../models/schema';
import {getSubFlowData,getUserIdBySubFlowId} from "../models/flowModel";
import { getFirstNodeIdFromFlow } from './botFlow';
import { sendMessageToAgent } from './eventManager';
import { chat } from 'googleapis/build/src/apis/chat';

async function fetchMessagesForChat(chatId: string) {
    try {
        const chat = await Chat.findById(chatId)
            .select({ messages: { $slice: -10 } }); // Get last 10 messages

        if (!chat || !chat.messages) return [];

        // Sort in descending order by createdOn
        const sortedMessages = chat.messages
            .sort((a, b) => new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime());

        return sortedMessages.map(({ message, isBot }) => ({ message, isBot }));
    } catch (e) {
        console.error("Error fetching messages: ", e);
        throw e;
    }
}


async function getOrCreateChat(chatId: string, flowId: string,companyId:string,adminId:string,userId:string,ip:string,userAgent:string) {
  try {
    let chat = await Chat.findById(chatId);

    if (chat) {
      // Document exists, return it
      return chat;
    } else {

      const {flowData,botName,botDescription}=await getSubFlowData(flowId);

      const currentFlowNodeId = typeof flowData ==="string" ? getFirstNodeIdFromFlow(JSON.parse(flowData)) :"1";

      // Document doesn't exist, create it
      chat = new Chat({
        _id: chatId,                    
        companyId,       
        userId,
        adminId,
        flowId,
        ip,
        userAgent,
        flowData,
        botRole : `${botName} - ${botDescription}`,
        currentFlowNodeId,            
        intents: {},
        isAgentHandover: false,
        isCompleted: false,
        isDeleted: false,
        sentiment: 'proceed',
        channel:"web",
        messages: [],
        createdOn: Math.floor(Date.now() / 1000),
      });

      //send event for new chat added
      sendMessageToAgent(companyId,{type:"chatAdded",
        chat:{
          _id:chatId,
          companyId,userId,
          flowId,flowData:[],
          userDetails:{name:"web user",email:"NA"},
          currentFlowNodeId,
          isAgentHandover:false,
          isCompleted:false,
          isDeleted:false,
          sentiment:"proceed",
          channel:"web",
          messages:[],
          intents:{},
          createdOn:new Date().getTime(),
          unseenMessages:0
        }
      })
      await chat.save();
      return chat;
    }
  } catch (error) {
    console.error("Error fetching or creating chat:", error);
    throw new Error("Could not get or create chat");
  }
}


async function getBotRole(chatId:string){


  try{  

    const chat=await Chat.findById(chatId);

    if(!chat){
      console.error("chat not found");
      return "";
    }

    return chat.botRole;
  }catch(err){

    console.error("Error getting bot role : ",err);
    throw new Error("Could not get bot role");
  }
}

async function addMessageForChat(chatId: string,messageContent: string,isBot: boolean,nodeId: number | string,isAgent:boolean = false) {
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const newMessage = {
      message: messageContent || "",
      createdOn: Math.floor(Date.now() / 1000),
      isBot,
      flowNodeId: nodeId,
      isAgent
    };

    chat.messages.push(newMessage);

    await chat.save();

    console.log("Message added to chat:", chatId);

    return chat.flowId;
  } catch (e) {
    console.error("Error adding message to chat:", e);
    throw e;
  }
}



async function updateChatIntentStore(chatId: string,intents: string | { [key: string]: string | number | Date | boolean }) {
  try {

    const chat = await Chat.findById(chatId);
    if (!chat) {
      console.error('Chat not found');
      return;
    }

    let intentsObject: { [key: string]: string | number | Date | boolean };
    if (typeof intents === 'string') {
      intentsObject = JSON.parse(intents);
    } else {
      intentsObject = intents;
    }

    // Merge new intents into the existing intents object
    chat.intents = {
      ...chat.intents,
      ...intentsObject,
    };

    await chat.save();


    //sending updated intent to agent
    sendMessageToAgent(chat.companyId,{type:"chatUpdated",chatData:{intents:chat.intents,sentiment:"proceed"}});

    console.log('Intent store updated successfully');
  } catch (e) {
    console.error('Error updating intent store', e);
    throw e;
  }
}





async function fetchIntentsFromChat(chatId: string,intents: string): Promise<{
filledIntents: { [key: string]: string | number | Date | boolean };
  emptyIntents: Array<{ [key: string]: string }>;
}> {
  try {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      console.error('Chat not found');
      return { filledIntents: {}, emptyIntents: [] };
    }

    const currentIntentStore = chat.intents || {};

    // Parse the incoming intents string
    const parsedIntents: Array<{ intent: string }> = JSON.parse(intents);

    const filledIntents: { [key: string]: string | number | Date | boolean } = {};
    const emptyIntents: Array<{ [key: string]: string }> = [];

    // Classify filled intents
    for (const [key, value] of Object.entries(currentIntentStore)) {
      if (
        (typeof value === 'string' && value.trim() !== '') ||
        typeof value === 'number' ||
        value instanceof Date ||
        typeof value === 'boolean'
      ) {
        filledIntents[key] = value;
      }
    }

    // Identify missing/empty intents
    parsedIntents.forEach((intentObj: { intent: string }) => {
      if (!filledIntents.hasOwnProperty(intentObj.intent)) {
        emptyIntents.push(intentObj);
      }
    });

    return { filledIntents, emptyIntents };
  } catch (e) {
    console.error('Error while getting intents:', e);
    return { filledIntents: {}, emptyIntents: [] };
  }
}



// async function getChatRefById(id: number | string): Promise<any> {
//     try {
//         // Reference to the 'chats' collection
//         const chatsCollection = collection(db, 'chats');
        
//         // Create a query to find the document with the specified `id`
//         const q = query(chatsCollection, where('id', '==', id));
        
//         // Execute the query
//         const querySnapshot = await getDocs(q);
        
//         if (!querySnapshot.empty) {
//             // Assume the first document is the one we want (handle multiple results as needed)
//             const docSnapshot = querySnapshot.docs[0];
//             return docSnapshot.ref; // Return the DocumentReference
//         } 
//     } catch (error) {
//         console.error('Error getting document reference by ID:', error);
//     }
// }




async function getCurrentFlowData(id: string | number): Promise<any> {
  try {
    const chat = await Chat.findById(id).lean();

    if (!chat) {
      console.error('Chat document not found.');
      return null;
    }

    const {
      flowData,
      currentFlowNodeId,
      isCompleted,
      isAgentHandover
    } = chat;

    if (!flowData) {
      console.error('flowData not found in chat document.');
      return null;
    }

    return {
      flowData,
      currentFlowNodeId,
      isCompleted,
      isAgentHandover
    };
  } catch (error) {
    console.error('Error getting node details:', error);
    return null;
  }
}


async function updateNodeId(chatId: string | number, nodeId: number | string, isCompleted: boolean = false): Promise<boolean> {
  try {
    // Update the chat document by _id (or change to another field if needed)
    const result = await Chat.findByIdAndUpdate(
      chatId,
      {
        currentFlowNodeId: nodeId,
        isCompleted: isCompleted
      },
      { new: true } // Returns the updated document
    );

    return result !== null;
  } catch (e) {
    console.error("Error while updating node ID in chat", e);
    return false;
  }
}




async function deleteMessagesExceptLastFour(chatId: string | number): Promise<void> {
  try {
    // Find chat by _id or custom id field - adjust if needed
    const chat = await Chat.findById(chatId);

    if (!chat) {
      console.error('Chat not found');
      return;
    }

    const messages = chat.messages || [];

    if (messages.length > 4) {
      // Keep only the last 4 messages
      chat.messages = messages.slice(-4);

      // Save updated chat document
      await chat.save();
    }
  } catch (error) {
    console.error('Error deleting messages:', error);
  }
}




async function updateChatForAgent(chatId: string | number): Promise<boolean> {
  try {
    // Find the chat document by id
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new Error('Chat document not found');
    }

    // Update the isAgentHandover field
    chat.isAgentHandover = true;

    // Save the updated chat document
    await chat.save();

    console.log('Chat document updated successfully');
    return true;
  } catch (e) {
    console.error('Error updating flow doc for agent handover', e);
    throw e;
  }
}


async function updateChatForRestart(chatId: string | number, startingNodeId: string): Promise<boolean> {
  try {
    // Find the chat document by id
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new Error('Chat document not found');
    }

    // Update the fields
    chat.currentFlowNodeId = parseInt(startingNodeId, 10);
    chat.isCompleted = false;
    chat.intents = {};

    // Save the updated document
    await chat.save();

    console.log('Chat document updated successfully');
    return true;
  } catch (err) {
    console.error('Error restarting flow doc', err);
    throw err;
  }
}




async function getVectorNamespace(chatId:string) : Promise<{ flowId: string; vectorNamespace: string }>{

  try{

    const chat=await Chat.findById(chatId);

    if(!chat){

      console.error("could not get chat");
      return {flowId : "",vectorNamespace:""};
    }

    const {userId,flowId}=await getUserIdBySubFlowId(chat.flowId) || {};

    return {flowId : flowId as string,vectorNamespace:userId as string};
  }catch(err){
    throw new Error("could not get vector namespace");
  }
}


async function updateChatSentiment(chatId: string | number, sentiment: string): Promise<boolean> {
  try {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new Error('Chat document not found');
    }

    chat.sentiment = sentiment;

    
        
    //sending updated intent to agent
    sendMessageToAgent(chat.companyId,{type:"chatUpdated",chatData:{sentiment}});

    await chat.save();

    console.log('Chat document updated successfully');
    return true;
  } catch (err) {
    console.error('Error while updating chat sentiment', err);
    throw err;
  }
}


async function getChatDetails(chatId:string){

  try{

    const chat=await Chat.findById(chatId);

    if(!chat){

      throw new Error("Chat document not found");
    }

    return chat;
  }catch(err){
    console.error(err);
    throw err;
  }
}











export { fetchMessagesForChat, addMessageForChat,updateChatIntentStore,fetchIntentsFromChat , getCurrentFlowData , updateNodeId ,deleteMessagesExceptLastFour,updateChatForAgent,updateChatForRestart, updateChatSentiment,getOrCreateChat,getBotRole,getVectorNamespace,getChatDetails};
