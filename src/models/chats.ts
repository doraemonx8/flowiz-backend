import Chat from "./schema";
import db from "./conn";
import { QueryTypes } from "sequelize";

// new helper: unified leads lookup by ids or search term
const getLeads = async (opts: { ids?: Array<string | number>, search?: string }) => {
  try {
    if (Array.isArray(opts.ids) && opts.ids.length) {
      const result: any = await db.sequelize.query(
        `SELECT id,name,email,phone,countryCode FROM leads WHERE leads.id IN (:userIds) AND leads.isDeleted ='0'`,
        {
          replacements: { userIds: opts.ids },
          type: QueryTypes.SELECT
        }
      );
      return result;
    }

    if (opts.search && typeof opts.search === 'string' && opts.search.trim()) {
      const likeTerm = `%${opts.search.trim()}%`;
      const result: any = await db.sequelize.query(
        `SELECT id,name,email,phone,countryCode FROM leads WHERE (name LIKE :term OR email LIKE :term OR phone LIKE :term) AND isDeleted ='0'`,
        {
          replacements: { term: likeTerm },
          type: QueryTypes.SELECT
        }
      );
      return result;
    }

    return [];
  } catch (err) {
    console.error("Error in getLeads:", err);
    return [];
  }
};

const getFlows = async ({ids}: {ids: Array<string | number>}) => {
  try {
    if (Array.isArray(ids) && ids.length) {
      const result: any = await db.sequelize.query(
        `SELECT subFlows.id AS id, campaigns.name AS name FROM campaigns JOIN subFlows ON campaigns.id = subFlows.campaignId WHERE subFlows.id IN (:flowIds) AND subFlows.isDeleted ='0'`,
     {
          replacements: { flowIds: ids },
          type: QueryTypes.SELECT
        }
      );
      return result;
    }
    return [];
  } catch (err) {
    console.error("Error in getLeads:", err);
    return [];
  }
};

const getChatsByAdminId = async (adminId: string, page: number, pageSize: number, filter?: string, search?: string) => {
  try {
    const baseMatch: any = { adminId: adminId.toString() };
    let matchCondition: any = { ...baseMatch };
    // apply explicit channel filter (e.g., 'web', 'whatsapp', 'email') if provided
    if (filter) {
      matchCondition.channel = filter;
    }
    // apply search term if provided
    if (search && typeof search === 'string' && search.trim().length) {
      const term = search.trim();
      // Get matching leads from SQL (name/email/phone)
      const leadSearchResults = await getLeads({ search: term });
      const leadIds = leadSearchResults.map((r: any) => String(r.id));
      // If no leads matched the search, short-circuit to return no chats
      if (!leadIds.length) {
        return { chats: [], total: 0 };
      }
      // Restrict Mongo match to chats whose userId is in matching lead IDs
      const searchMatch = { userId: { $in: leadIds } };
      if (matchCondition.$and) {
        matchCondition.$and.push(searchMatch);
      } else {
        matchCondition = { $and: [matchCondition, searchMatch] };
      }
    }
  // Get total count for pagination metadata
  const total = await Chat.countDocuments(matchCondition);
    // If pagination params provided, use skip/limit in aggregation
      const skip = (Math.max(1, page) - 1) * Math.max(1, pageSize);
      const chats = await Chat.aggregate([
        { $match: matchCondition },
        { $sort: { createdOn: -1 } },
        { $skip: skip },
        { $limit: pageSize },
        {
          $addFields: {
            messages: {
              $slice: [
                { $reverseArray: "$messages" },
                20
              ]
            }
          }
        },
        {
          $addFields: {
            messages: { $reverseArray: "$messages" }
          }
        }
      ]);
      return { chats, total };
  } catch (err) {
    console.error("An error occurred while getting chats :", err);
    return { chats: [], total: 0 };
  }
}

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

export {getChatsByAdminId, getLeads,createNewChat,getMessages,addMessage,checkCompanyForAgent,handleAgentHandover,createOrUpdateChat,setAgentHandover,createChat,getWhatsAppChatId,getChatData,incrementMessageLedger,getFlows};
