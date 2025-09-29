import db from "../models/conn";
import { QueryTypes } from "sequelize";
import Chat from "./schema";

const getCampaignsDataFromDB=async(userId:string,filter:string)=>{

    try{

        let dateFilter = '';

        if (filter === "week") {
          dateFilter = `AND DATE(modifiedOn) >= CURDATE() - INTERVAL 7 DAY`;
        } else if (filter === "month") {
          dateFilter = `AND MONTH(modifiedOn) = MONTH(CURDATE()) AND YEAR(modifiedOn) = YEAR(CURDATE())`;
        }

        const res=await db.sequelize.query(
            `SELECT
            SUM(CASE WHEN status = '2' THEN 1 ELSE 0 END) AS activeCount,
            SUM(CASE WHEN status != '2' THEN 1 ELSE 0 END) AS nonActiveCount
            FROM campaigns
            WHERE userId = :userId AND isDeleted='0'
            ${dateFilter}
            ;
        `,{
            replacements:{userId},
            type:QueryTypes.SELECT
            }
        );


        if('activeCount' in res[0] && 'nonActiveCount' in res[0]){
            return {activeCampaigns : res[0].activeCount, nonActiveCampaigns:res[0].nonActiveCount}
        }

        return {activeCampaigns : 0,nonActiveCampaigns : 0};

    }catch(err){

        console.error(err);
        return {activeCampaigns : 0,nonActiveCampaigns : 0};
    }
}


const getLeadConversion = async (adminId:string,companyId: string, filter: string) => {
    const now = Math.floor(Date.now() / 1000);

    let dateFilter: any = {};

    if (filter === "week") {
        const last7Days = now - 7 * 24 * 60 * 60;
        dateFilter.createdOn = { $gte: last7Days };
    } else if (filter === "month") {
        const firstDayOfMonth = new Date();
        firstDayOfMonth.setDate(1);
        firstDayOfMonth.setHours(0, 0, 0, 0);
        const firstDayTimestamp = Math.floor(firstDayOfMonth.getTime() / 1000);
        dateFilter.createdOn = { $gte: firstDayTimestamp };
    }

    const chats = await Chat.find(
        { companyId,adminId, ...dateFilter },
        { isCompleted: 1, channel: 1, _id: 0 }
    ).lean();

    const totalChats = chats.length;
    const completedChats = chats.filter(chat => chat.isCompleted === true).length;
    const webCompletedChats = chats.filter(chat => chat.isCompleted === true && chat.channel === 'web').length;
    const whatsAppCompletedChats = chats.filter(chat => chat.isCompleted === true && chat.channel === 'whatsapp').length;
    const emailCompletedChats = chats.filter(chat => chat.isCompleted === true && chat.channel === 'email').length;

    const conversion = totalChats === 0 ? "0.00" : ((completedChats / totalChats) * 100).toFixed(2);

    return {conversion,totalChats,webCompletedChats,whatsAppCompletedChats,emailCompletedChats};
};





const getAgentMessageCount = async (adminId:string,companyId: string, filter: string) => {
    const now = new Date();

    let startDate: Date | null = null;

    if (filter === "week") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    } else if (filter === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of this month
    }

    const dateMatch = startDate
        ? { "messages.createdDate": { $gte: startDate } }
        : {};

    const data = await Chat.aggregate([
        {
            $match: {
                companyId: companyId.toString(),
            },
        },
         {
            $match: {
                adminId: adminId.toString(),
            },
        },
        { $unwind: "$messages" },
        {
            $addFields: {
                "messages.createdDate": {
                    $toDate: { $multiply: ["$messages.createdOn", 1000] }, 
                },
            },
        },
        {
            $match: {
                ...dateMatch, 
            },
        },
        {
            $project: {
                date: "$messages.createdDate",
                channel: 1,
            },
        },
        {
            $group: {
                _id: { date: "$date", channel: "$channel" },
                count: { $sum: 1 },
            },
        },
        {
            $project: {
                _id: 0,
                date: "$_id.date",
                channel: "$_id.channel",
                count: 1,
            },
        },
        {
            $sort: { date: 1 },
        },
    ]);

    return data;
};



const getrecentCampaignsData=async(userId:string)=>{

    try{
    const res = await db.sequelize.query(
    `SELECT 
        campaigns.id AS campaignId,
        campaigns.name,
        campaigns.status,
        campaigns.scheduledAt,
        GROUP_CONCAT(CONCAT(subFlows.type, ':', subFlows.id) SEPARATOR ',') AS subFlows
    FROM campaigns
    INNER JOIN subFlows 
        ON subFlows.flowId = campaigns.flowId
    WHERE campaigns.userId = :userId 
        AND campaigns.isDeleted = '0'
    GROUP BY campaigns.id;`,
    {
        replacements: { userId },
        type: QueryTypes.SELECT
    }
    )as Array<{
  campaignId: string;
  name: string;
  status: string;
  scheduledAt: string;
  subFlows: string;
}>;

    if (res.length === 0) {
    return null;
    }

    const data = res.map((campaign) => {
    const subFlowObj: Record<string, string> = {};
  
    campaign.subFlows.split(',').forEach((item: string) => {
        const [type, id] = item.split(':');

        if (type === '1') {
        subFlowObj['email'] = id;
        } else if (type === '2') {
        subFlowObj['web'] = id;
        } else if (type === '3') {
        subFlowObj['call'] = id;
        } else {
        subFlowObj['whatsapp'] = id;
        }
    });

    return {
        name: campaign.name,
        status: campaign.status,
        scheduledAt: campaign.scheduledAt,
        subFlows: subFlowObj
    };
    });

    
    return data;

    }catch(err){

        console.error("An error occured while getting recent data : ",err);
        return null;

    }
}
    

const getLeadConversionPerCampaign = async (flowIds: string[]) => {
  const chats = await Chat.find(
    { flowId: { $in: flowIds } },
    { isCompleted: 1, channel: 1, _id: 0 }
  ).lean();

  const totalChats = chats.length;
  const completedChats = chats.filter((chat) => chat.isCompleted === true).length;

  const webCompletedChats=chats.filter((chat)=> chat.isCompleted==true && chat.channel=='web').length;
  const whatsAppCompletedChats=chats.filter((chat)=>chat.isCompleted==true && chat.channel=='whatsapp').length;
  const emailCompletedChats=chats.filter((chat)=>chat.isCompleted==true && chat.channel=="email").length;

  const conversion =
    totalChats > 0 ? ((completedChats / totalChats) * 100).toFixed(2) : "0.00";

  return {conversion,webCompletedChats,whatsAppCompletedChats,emailCompletedChats};
};


const getRecentConversations = async (adminId:string,companyId: string) => {
  const messages = await Chat.aggregate([
    { $match: { companyId: companyId.toString(),adminId:adminId.toString() } },
    { $unwind: "$messages" },
    {
      $project: {
        _id: 0,
        channel: 1,
        message: "$messages.message",
        timestamp: "$messages.createdOn"
      }
    },
    { $sort: { timestamp: -1 } },
    { $limit: 4 }
  ]);


  return messages;
}


const getRecentNotifications=async(userId:string)=>{

    try{

        const res=await db.sequelize.query(
            `SELECT type,text from notifications WHERE notifications.userId=:userId AND notifications.isDeleted='0';`,
            {replacements:{userId},type:QueryTypes.SELECT}
        );

        return res;
    }catch(err){
        console.error("An error occured while getting notifications : ",err);
        return null;
    }
}
 

export {getCampaignsDataFromDB,getLeadConversion,getAgentMessageCount,getrecentCampaignsData,getLeadConversionPerCampaign,getRecentConversations,getRecentNotifications};