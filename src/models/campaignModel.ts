import db from "../models/conn";
import { QueryTypes } from "sequelize";
import { Job } from "./schema";


const getCampaignData=async(campaignId : string | number) : Promise<any>=>{

    try{

        const data= await db.sequelize.query(
          `SELECT 
    campaigns.id AS campaignId,
    campaigns.scheduledAt,
    campaigns.companyId AS companyId,
    -- Aggregate subFlows data as JSON array
    CASE 
        WHEN COUNT(DISTINCT subFlows.id) = 0 THEN '[]'
        ELSE CONCAT(
            '[', 
            GROUP_CONCAT(DISTINCT 
                CONCAT(
                    '{"type":"', COALESCE(subFlows.type, ''), 
                    '","id":"', COALESCE(subFlows.id, ''), '"',
                    ',"flowData":', CASE 
                        WHEN subFlows.flowData IS NULL THEN 'null'
                        WHEN JSON_VALID(subFlows.flowData) THEN subFlows.flowData
                        ELSE CONCAT('"', REPLACE(REPLACE(subFlows.flowData, '\\\\', '\\\\\\\\'), '"', '\\"'), '"')
                    END,
                    ',"json":', CASE 
                        WHEN subFlows.json IS NULL THEN 'null'
                        WHEN JSON_VALID(subFlows.json) THEN subFlows.json
                        ELSE CONCAT('"', REPLACE(REPLACE(subFlows.json, '\\\\', '\\\\\\\\'), '"', '\\"'), '"')
                    END,
                    '}'
                )
                SEPARATOR ','
            ), 
            ']'
        )
    END AS subFlows,
    -- Aggregate leads data as JSON array
    CASE 
        WHEN COUNT(DISTINCT leads.id) = 0 THEN '[]'
        ELSE CONCAT(
            '[', 
            GROUP_CONCAT(DISTINCT 
                CONCAT(
                    '{"id":"', COALESCE(leads.id, ''), '"',
                    ',"email":"', REPLACE(REPLACE(COALESCE(leads.email, ''), '\\\\', '\\\\\\\\'), '"', '\\"'), '"',
                    ',"name":"', REPLACE(REPLACE(COALESCE(leads.name, ''), '\\\\', '\\\\\\\\'), '"', '\\"'), '"',
                    ',"phone":"', REPLACE(REPLACE(COALESCE(leads.phone, ''), '\\\\', '\\\\\\\\'), '"', '\\"'), '"}'
                )
                SEPARATOR ','
            ), 
            ']'
        )
    END AS leads
FROM campaigns
LEFT JOIN subFlows ON campaigns.flowId = subFlows.flowId
LEFT JOIN leads ON FIND_IN_SET(leads.id, campaigns.leads) > 0
WHERE campaigns.id = :campaignId
GROUP BY campaigns.id, campaigns.scheduledAt, campaigns.companyId;
`,

            {
                replacements:{campaignId},
                type:QueryTypes.SELECT
            },

        );

        return data;
    }catch(err){

        console.error(`An error occured while getting campaign data from db : ${err}`);

        return [];
    }
}


const campaignStatusMap : Record<string, string>={
    'completed':'1',
    'running':'2',
    'paused':'3',
    'cancelled':'4',
    'pending':'5',
}

const updateCampaignStatusDB=async(campaignId:string | number,status:string)=>{

    try{

        await db.sequelize.query(
            `UPDATE campaigns SET campaigns.status=:status WHERE campaigns.id=:campaignId`,
            {
                replacements:{status : campaignStatusMap[status],campaignId},
                type:QueryTypes.UPDATE
            }
        )

        return true;
    }catch(err){

        console.error(`An error occured while upadting campaign status in db : ${err}`);
        return false;
    }
}




  

  type CampaignRow = { id: string };

  const getCampaignIdBySlug = async (
    slug: string,
    userId: string
  ): Promise<CampaignRow[] | null> => {
    try {
      const res = await db.sequelize.query<CampaignRow>(
        `SELECT campaigns.id FROM campaigns INNER JOIN flows ON flows.id = campaigns.flowId 
         WHERE flows.slug = :slug AND flows.userId = :userId AND campaigns.isDeleted = '0'`,
        {
          replacements: { slug, userId },
          type: QueryTypes.SELECT,
        }
      );
  
      return res;
    } catch (err) {
      console.error("An error occurred while getting campaign ID by slug:", err);
      return null;
    }
  };
  
const getCampaignTime = async (slug : string, userId:string) => {
  try {
    const result = await db.sequelize.query(
      `SELECT scheduledAt 
       FROM campaigns 
       INNER JOIN flows ON flows.id = campaigns.flowId 
       WHERE campaigns.userId = :userId AND flows.slug = :slug`,
      {
        replacements: { userId, slug },
        type: QueryTypes.SELECT,
      }
    );

    if (result.length > 0 && 'scheduledAt' in result[0]) {
      return result[0].scheduledAt;
    }

    return null;
  } catch (err) {
    console.error("Error fetching campaign time:", err);
    return null;
  }
};


const createCampaign=async(userId:string,companyId:string,flowId:string,name:string,subscriptionId:number)=>{

  const t=await db.sequelize.transaction();

  try{

     await db.sequelize.query(
  `INSERT INTO campaigns (userId, companyId, flowId, name, status) 
   VALUES (:userId, :companyId, :flowId, :name, :status)`,
  {
    replacements: {
      userId,
      companyId,
      flowId,
      name,
      status: '5'
    },type:QueryTypes.INSERT
  }
);

    await db.sequelize.query(
      "INSERT INTO ledger(userId,subscriptionId,isDeposit,source,message,type) VALUES(:userId,:subscriptionId,'0','1','Campaign created using subscription','campaign')",
      {
        replacements:{userId,subscriptionId},
        type:QueryTypes.INSERT
      }

    );

    await t.commit();
    return true;
  }catch(err){
    await t.rollback();
    console.error("An error occured while creating campaign :",err);
    return false;
  }
}




const getAllCampaigns=async(userId:string) =>{

  try{

    const res=await db.sequelize.query(
      `SELECT 
    flows.slug,
    flows.createdOn,
    campaigns.scheduledAt,
    campaigns.id AS campaignId,
    campaigns.status,
    campaigns.timezone,
    campaigns.name,
    flows.json,
    GROUP_CONCAT(DISTINCT subFlows.type) AS subFlowTypes
    FROM flows
    INNER JOIN campaigns ON flows.id = campaigns.flowId
    LEFT JOIN subFlows ON subFlows.flowId = flows.id
    WHERE 
        flows.userId =:userId AND 
        flows.isDeleted = '0' AND 
        campaigns.isDeleted = '0'
    GROUP BY 
        campaigns.id
    ORDER BY 
        flows.createdOn DESC;`,
      {replacements:{userId},type:QueryTypes.SELECT}
    );

    return res ;
  }catch(err){
    console.error("An error occured while getting all campaigns : ",err);
    return null;
  }
}


const deleteCampaignDB=async(userId:string,id:string):Promise<boolean>=>{

  try{

    await db.sequelize.query(
      `UPDATE campaigns 
      INNER JOIN flows ON flows.id = campaigns.flowId 
      SET 
          campaigns.isDeleted = '1',
          flows.isDeleted = '1'
      WHERE 
          campaigns.id = :id 
          AND campaigns.userId = :userId;
      `,
      {replacements:{userId,id},type:QueryTypes.UPDATE}
    );

    return true;
  }catch(err){

    console.error(err);
    return false;
  }
}

const checkAudienceAndSetLeads = async (audienceId: string,userId: string,campaignId: string) => {
  try {


    const ids: { id: number }[] = await db.sequelize.query(
      `SELECT leads.id
FROM leads
JOIN audience ON FIND_IN_SET(audience.id, leads.audienceIds) > 0
WHERE FIND_IN_SET(:audienceId, leads.audienceIds) > 0
  AND audience.userId = :userId;
`,
      {
        replacements: { userId, audienceId },
        type: QueryTypes.SELECT,
      }
    );

    if (!ids.length) {
      return false;
    }

    const leadIds = ids.map((item) => item.id).join(',');

    // Update campaign
    await db.sequelize.query(
      `UPDATE campaigns SET leads = :leadIds WHERE id = :campaignId`,
      {
        replacements: { leadIds, campaignId },
        type: QueryTypes.UPDATE,
      }
    );

    return ids.length;
  } catch (err) {
    console.error(err);
    return false;
  }
};



const editCampaignNameDB=async(userId:string,id:string,name:string)=>{

  try{

    await db.sequelize.query("UPDATE campaigns SET name=:name WHERE id=:id AND userId=:userId",
      {
        replacements:{userId,name,id},
        type:QueryTypes.UPDATE
      }
    )

    return true;
  }catch(err){

    console.error(err);
    return false;
  }
}


const setTemplateDB=async(userId:string,id:string,template:string)=>{

  try{

    await db.sequelize.query("UPDATE campaigns SET template=:template WHERE userId=:userId AND id=:id AND isDeleted='0'",
      {
        replacements:{userId,template,id},
        type:QueryTypes.UPDATE
      }
    );

    return true;
  }catch(err){

    console.error(err);
    return false;
  }
}


const getCampaignProgress=async(campaignId:string) =>{

  try{

    const completedJobs=await Job.countDocuments({campaignId,status:{$ne:"pending"}});
    const pendingJobs=await Job.countDocuments({campaignId,status:"pending"});

    const totalJobs=completedJobs+pendingJobs;

    if(totalJobs===0){
      return 0.00;
    }
    return ((completedJobs/totalJobs)*100).toFixed(2);
  }catch(err){
    console.error(err);
    return 0.00 ;
  }
}


const updateCampaignAudience=async(userId:string,slug:string,audience:string)=>{

  try{

    if(!audience){
      return true;
    }
    await db.sequelize.query("UPDATE campaigns INNER JOIN flows on flows.id=campaigns.flowId SET audienceId=:audience  WHERE campaigns.userId=:userId AND flows.slug=:slug",{
      replacements:{userId,audience,slug},
      type:QueryTypes.UPDATE
    });

    return true;

  }catch(err){

    console.error(err);
    return false;
  }

}


const updateCampaignAgents=async(campaignId:string,agents:string)=>{

  try{

    await db.sequelize.query("UPDATE campaigns SET agents=:agents WHERE id=:campaignId",{
      replacements:{campaignId,agents},
      type:QueryTypes.UPDATE
    });
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}


const saveKeywords = async (campaignId: string, keywords: string, userId: string) => {
  const t = await db.sequelize.transaction();

  try {
    // Insert if not exists, else return existing
    const [result] = await db.sequelize.query(
      `
      INSERT INTO crawl (keywords, userId, campaignId,offset) VALUES (:keywords, :userId, :campaignId,50) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
      `,
      {
        replacements: { campaignId, keywords, userId },
        transaction: t,
      }
    );

    const keywordId = result;

    await db.sequelize.query(
      `UPDATE campaigns SET keywords = :keywordId WHERE id = :campaignId`,
      {
        replacements: { campaignId, keywordId },
        transaction: t,
      }
    );

    await t.commit();
    return keywordId;
  } catch (err) {
    await t.rollback();
    console.error(err);
    return false;
  }
};




const updateCampaignEmail=async(campaignId:string,emailId:string)=>{
  try{

    await db.sequelize.query("UPDATE campaigns SET emailId=:emailId WHERE id=:campaignId",{
      replacements:{campaignId,emailId},
      type:QueryTypes.UPDATE
    });
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}


const updateTimezone=async(campaignId:string,timezone:string,scheduledAt:string)=>{

  try{

      await db.sequelize.query("UPDATE campaigns SET timezone=:timezone,scheduledAt=:scheduledAt WHERE id=:campaignId",{
      replacements:{campaignId,timezone,scheduledAt},
      type:QueryTypes.UPDATE
    });
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}

export {getCampaignData,updateCampaignStatusDB,getCampaignIdBySlug,getCampaignTime,createCampaign,getAllCampaigns,deleteCampaignDB,checkAudienceAndSetLeads,editCampaignNameDB,setTemplateDB,getCampaignProgress,updateCampaignAudience,updateCampaignAgents,saveKeywords,updateCampaignEmail,updateTimezone};
