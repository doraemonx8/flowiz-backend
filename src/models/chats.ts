import Chat from "./schema";
import db from "./conn";
import { QueryTypes } from "sequelize";

const getChatsByAdminId = async (adminId:string) => {
    try {
        const chats = await Chat.aggregate([
            {
                $match: {
                    adminId: adminId.toString(),
                    $or: [
                        { channel: { $ne: "email" } }, 
                        { //only get email chats with more than 1 message
                            channel: "email",
                            "messages.1": { $exists: true }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    messages: {
                        $slice: [
                            { $reverseArray: "$messages" }, // reverse to get latest first
                            20
                        ]
                    }
                }
            },
            {
                $addFields: {
                    messages: { $reverseArray: "$messages" } // reverse again to maintain chronological order
                }
            },
            {
                $sort: { createdOn: -1 } // optional: sort chats by latest creation date
            }
        ]);

        return chats;
    } catch (err) {
        console.error("An error occurred while getting chats :", err);
        return [];
    }
}


const getUsersByUserIdList = async (users: Array<string | number>) => {
    try {
      // Ensure that users is not empty
      if (users.length === 0) {
        console.log("No users provided.");
        return [];
      }
  
      // Use a parameterized query to prevent SQL injection
      const result = await db.sequelize.query(
        `SELECT id,name,email,phone FROM leads WHERE leads.id IN (:userIds) AND leads.isDeleted ='0'`,
        {
          replacements: { userIds: users},
          type: QueryTypes.SELECT
        }
      );
  
      console.log(result);
      return result;

    } catch (err) {
      console.error("An error occurred while getting users: ", err);
      return [];
    }
  };


  const createNewChat=async(companyId:string,userId:string,flowId:string)=>{

    try{

        const newChat=await Chat.create({
            companyId,
            userId,
            flowId,
            currentFlowNodeId:'1',
            isAgentHandover:false,
            isCompleted:false,
            isDeleted:false,
            sentiment:"proceed",
            messages:[],
            createdOn:Math.floor(Date.now() / 1000)
        });


        return true;
    }catch(err){

        console.error("An error occured while creating new chat in monogo DB : ",err);
        return false;
    }
  }


  const getMessages=async (chatId:string)=>{


    try{

        const chat = await Chat.findOne({ _id: chatId }).select('messages');
        const messages = chat ? chat.messages.slice(-20) : [];

        // const messages=await chat?.messages || [];

        return messages;
          
    }catch(err){

        console.error("An error occured while getting messages from monog DB : ",err);
        return [];
    }
  }


  const addMessage=async(chatId:string,message:Record<string,any>)=>{

    try{

        await Chat.updateOne({_id:chatId},{$push : {messages:message}});

        return true;
    }catch(err){

        console.error("An error occured while adding message in mongo DB : ",err);

        return false;
    }
  }


  const checkCompanyForAgent=async(chatId:string,companyId:string)=>{

    try{

        const chat=await Chat.findOne({_id:chatId}).select('companyId');

        return chat && chat.companyId==companyId;
    }catch(err){

        console.error("An error occured while checking company for agent in mongo DB : ",err);
        return false;
    }
  }


  const handleAgentHandover=async(chatId:string,isAgentHandover:boolean,agentId:string | number)=>{


    try{

        await Chat.updateOne({_id:chatId},{$set :{isAgentHandover,agentId}});
        return true;
    }catch(err){

        console.error("An error occured while setting agent handover : ",err);
        return false;
    }
  }


  interface createUpdateChatInterface{

    campaignId:string;
    userId:string;
    channel:string;
    isBot:boolean;
    flowNodeId:string;
    companyId:string;
    message:string;
    flowId:string;

  }




  const createOrUpdateChat = async (data: createUpdateChatInterface) => {
    try {
      const { campaignId, userId, companyId, channel, flowId, flowNodeId, message, isBot } = data;
      const chat = await Chat.findOne({ campaignId, userId, companyId });
  
      if (chat) {
        // Ensure channels exist and update the specific channel
        chat.channels = chat.channels || {};  // Initialize if undefined
  
        if (!chat.channels[channel]) {
          (chat as any).channels[channel] = {
            flowId,
            currentFlowNodeId: flowNodeId,
            isCompleted: false,
            isAgentHandover: false,
            createdOn: new Date(),
            intents: {},
            messages: [],
          };
        }
  
        (chat as any).channels[channel].messages.push({
          flowNodeId,
          message,
          createdOn: new Date(),
          isBot,
          userId: null,
        });
  
        await chat.save();
      } else {
        // Create a new chat document
        const newChat = new Chat({
          userId,
          campaignId,
          companyId,
          createdOn: new Date(),
          isDeleted: false,
          channels: {
            [channel]: {
              flowId,
              currentFlowNodeId: flowNodeId,
              isCompleted: false,
              isAgentHandover: false,
              createdOn: new Date(),
              intents: {},
              messages: [
                { flowNodeId, message, createdOn: new Date(), isBot, userId: null },
              ],
            },
          },
        });
  
        await newChat.save();
        return true;
      }
    } catch (err) {
      console.error(`An error occurred while creating or updating chat: ${err}`);
      return false;
    }
  };





  const createChat=async(data:any)=>{

    try{
      const newChat=new Chat({
        ...data
      });

      await newChat.save();

      return true;
    }catch(err){

      console.error("An error occured while creating chat : ",err);
      return false;
    }
  }

  const setAgentHandover=async(chatId:string,isHandover:boolean,companyId:string)=>{

    try{

      await Chat.findOneAndUpdate(
        { _id: chatId, companyId },
        [
          {
            $set: {
              isAgentHandover: isHandover,
              unseenMessages: 0,
              messages: {
                $map: {
                  input: "$messages",
                  as: "msg",
                  in: { $mergeObjects: ["$$msg", { isSeen: true }] }
                }
              }
            }
          }
        ]
      );
      

      return true;
    }catch(err){

      console.error("An error occured while setting agent handover : ",err);
      return false;
    }
  }
  
  

const getWhatsAppChatId = async (phoneNumberId: string, phone: string) => {
  try {
    const result = await Chat.aggregate([
      {
        $match: {
          phoneNumberId,
          userPhone: phone,
        },
      },
      {
        $addFields: {
          latestMessageTime: {
            $max: '$messages.createdOn',
          },
        },
      },
      {
        $sort: { latestMessageTime: -1 },
      },
      {
        $limit: 1,
      },
      {
        $project: {
          _id: 1,
          flowId:1,
          userId:1,
          companyId:1,
          adminId:1
        },
      },
    ]);

    return result.length ? result[0] : null;
  } catch (err) {
    console.error(err);
    return null;
  }
};


const getChatData=async(chatId:string)=>{
  
  try{

    const chat=await Chat.findOne({
      _id:chatId
    });

    if(!chat){
      return null
    }

    return chat;
  }catch(err){
    console.error("An error occured while getting chat type : ",err);
    return null;
  }
}


const incrementMessageLedger=async(userId:string,subscriptionId:string,type:string)=>{

  try{

    await db.sequelize.query(`INSERT INTO ledger (userId,subscriptionId,type,message) VALUES (:userId,:subscriptionId,:type,:message)`,
      {
        replacements:{userId,subscriptionId,type,message:`${type} message sent`},
        type:QueryTypes.INSERT
      }
    );

    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}

export {getChatsByAdminId,getUsersByUserIdList,createNewChat,getMessages,addMessage,checkCompanyForAgent,handleAgentHandover,createOrUpdateChat,setAgentHandover,createChat,getWhatsAppChatId,getChatData,incrementMessageLedger};
