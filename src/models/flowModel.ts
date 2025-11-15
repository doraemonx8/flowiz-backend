import db from "../models/conn";
import { QueryTypes } from "sequelize";

const upsertFlowConfig = async (userId: string | number, flowConfigData: string, flowSlug: string,type:string) => {
    try {
        //Check if the subFlow exists
        const existing = await db.sequelize.query(
            `SELECT subFlows.id 
             FROM subFlows 
             JOIN flows ON subFlows.flowId = flows.id 
             WHERE flows.slug =:flowSlug 
             AND subFlows.userId =:userId 
             AND subFlows.type =:type
             LIMIT 1`,
            {
                replacements: { userId,flowSlug,type },
                type: QueryTypes.SELECT,
            }
        );

        if (existing.length > 0) {
            //Update
            await db.sequelize.query(
                `UPDATE subFlows 
                 JOIN flows ON subFlows.flowId = flows.id 
                 SET subFlows.configData =:configData 
                 WHERE flows.slug =:flowSlug 
                 AND subFlows.userId =:userId 
                 AND subFlows.type =:type`,
                {
                    replacements: { userId, configData: flowConfigData, flowSlug,type },
                    type: QueryTypes.UPDATE,
                }
            );
            return (existing[0] as { id: string | number }).id;
        } else {
            //Create
            const flow = await db.sequelize.query(
                `SELECT id FROM flows WHERE slug =:flowSlug LIMIT 1`,
                {
                    replacements: { flowSlug },
                    type: QueryTypes.SELECT,
                }
            );
            if (!flow.length) return null;
            const flowId = (flow[0] as { id: number }).id;
            const insertResult = await db.sequelize.query(
                `INSERT INTO subFlows (userId, flowId, configData, type) 
                 VALUES (:userId, :flowId, :configData, :type)`,
                {
                    replacements: { userId, flowId, configData: flowConfigData,type },
                    type: QueryTypes.INSERT,
                }
            );
            return insertResult[0] || null;
        }
    } catch (err) {
        console.error("An error occurred while upserting flow config DB: ", err);
        return null;
    }
};

const getFlowConfigFromDB=async(flowId:string | number)=>{
    try{
        const data=await db.sequelize.query(
            `SELECT configData from subFlows WHERE id=:flowId `,
            {
                replacements:{flowId},
                type:QueryTypes.SELECT,
            }
        );
        return data;
    }catch(err){
        console.error("An error occured while getting flow config : ",err);
        return [];
    }
}


const getSubFlowDataFromDB = async (slug: string, type: string,userId:string): Promise<Array<{ flowData: string; flowShowData: string; json: string }>> => {
    try {
        const data = await db.sequelize.query(
            `SELECT subFlows.flowData, subFlows.flowShowData, subFlows.json 
             FROM subFlows 
             INNER JOIN flows ON flows.id = subFlows.flowId 
             WHERE flows.slug = :slug 
             AND subFlows.type = :type 
             AND subFlows.userId=:userId
             AND flows.isDeleted = '0'`,
            {
                replacements: { slug, type,userId },
                type: QueryTypes.SELECT
            }
        );
        return data as Array<{ flowData: string; flowShowData: string; json: string }>;
    } catch (err) {
        console.error("An error occurred while getting sub-flow data:", err);
        return [];
    }
};
const getParentFlowPrompt = async (slug: string): Promise<string> => {
    try {
        const result = await db.sequelize.query(
            `SELECT flows.prompt FROM flows WHERE flows.slug = :slug AND flows.isDeleted = '0'`,
            {
                replacements: { slug },
                type: QueryTypes.SELECT
            }
        );

        const promptData = result as Array<{ prompt: string }>;
        return promptData.length > 0 ? promptData[0].prompt : "";
    } catch (err) {
        console.error("An error occurred while getting parent flow prompt:", err);
        return "";
    }
};

const saveSubFlowToDB = async (data: string,slug: string,type: string,userId: string,campaignId: string) => {
  try {
    const [flow]: { id: string }[] = await db.sequelize.query(
      `SELECT id FROM flows WHERE slug = :slug AND userId = :userId AND isDeleted = '0'`,
      {
        replacements: { slug, userId },
        type: QueryTypes.SELECT,
      }
    );

    if (!flow) return false;
    const [existingSubFlow]: { id: string }[] = await db.sequelize.query(
      `SELECT id FROM subFlows WHERE flowId = :flowId AND type = :type AND userId = :userId`,
      {
        replacements: { flowId: flow.id, type, userId },
        type: QueryTypes.SELECT,
      }
    );

    let result;
    if (existingSubFlow) {
      [result] = await db.sequelize.query(
        `UPDATE subFlows SET json = :data
         WHERE id = :id`,
        {
          replacements: { data, id: existingSubFlow.id },
          type: QueryTypes.UPDATE,
        }
      );
    } else {
      [result] = await db.sequelize.query(
        `INSERT INTO subFlows (userId, campaignId, flowId, type, json) 
         VALUES (:userId, :campaignId, :flowId, :type, :data)`,
        {
          replacements: { userId, campaignId, flowId: flow.id, type, data },
          type: QueryTypes.INSERT,
        }
      );
    }
    return true;
  } catch (err) {
    console.error("An error occurred while inserting/updating sub-flow data:", err);
    return false;
  }
};




const getAudiencesFromDB=async(userId:string)=>{

    try{

        const result = await db.sequelize.query(
            `SELECT audience.id,audience.name FROM audience WHERE audience.userId = :userId AND audience.isDeleted = '0'`,
            {
                replacements: { userId },
                type: QueryTypes.SELECT
            }
        );

        return result;

    }catch(err : any){

        console.error("An error occured while getting audiences from DB : ",err.message);
        return [];
    }
}


const saveFlowConfigDB=async(configData:any,userId:string,slug:string)=>{

    try{

        const result = await db.sequelize.query(
            `UPDATE flows
             SET flows.configData = :configData 
             WHERE flows.slug = :slug 
             AND flows.userId = :userId 
             AND flows.isDeleted = '0'`,
            {
                replacements: { userId, configData,slug },
                type: QueryTypes.UPDATE,
            }
        );
        return true;
    }catch(err){
        console.error("An error occured while saving flow config in db : ",err);
        return false;
    }
}


const getFlowConfigDB=async(slug:string,userId:string)=>{

    try{

        const result = await db.sequelize.query(
            `SELECT flows.configData FROM flows WHERE flows.userId=:userId AND flows.slug=:slug AND flows.isDeleted='0'`,
            {
                replacements: { userId,slug },
                type: QueryTypes.SELECT
            }
        );

        return result;
    }catch(err){

        console.error("An error occured while getting flow config from db : ",err);
        return [];
    }
}



const getCompanyIdByFlow = async (flowId: string): Promise<any> => {
  try {
    const result = await db.sequelize.query(
      `SELECT companyId,users.id as adminId FROM users
       INNER JOIN subFlows ON subFlows.userId = users.id 
       WHERE subFlows.id = :flowId 
       AND users.isDeleted = '0' 
       AND subFlows.isDeleted = '0'`,
      {
        replacements: { flowId },
        type: QueryTypes.SELECT
      }
    );

    const typedResult = result as { companyId: string,adminId:string }[];

    if (typedResult.length > 0) {
      return {companyId:typedResult[0].companyId,adminId:typedResult[0].adminId};
    }

    return null;
  } catch (err) {
    console.error("An error occurred while getting companyId from flow:", err);
    return null;
  }
};



const getFlowIdBySlug=async(slug:string,userId:string)=>{

    try{

        const result=await db.sequelize.query(
            `SELECT id FROM flows WHERE slug=:slug AND userId=:userId AND isDeleted='0'`,
            {
                replacements:{userId,slug},
                type:QueryTypes.SELECT
            }
        )

         // Ensure result is not empty
        if (result.length > 0 && 'id' in result[0]) {
            return result[0].id;
        }

    return null;
    }catch(err){
        console.error("An error occured while getting flow id : ",err);
        return null;
    }
}


const getSubFlowData=async(id:string)=>{

    try{

        const result=await db.sequelize.query(
            `SELECT flowData,configData FROM subFlows WHERE id=:id AND isDeleted='0'`,
            {
                replacements : {id},
                type:QueryTypes.SELECT
            }
        )

        if(result.length > 0 && 'flowData' in result[0] && 'configData' in result[0]){


            // return result[0].flowData

            const configData=JSON.parse(result[0]?.configData as string);

            return {flowData : result[0].flowData,botName:configData?.botName,botDescription:configData?.description};
        }

        return {flowData : [],botName:null,botDescription:null};
    }catch(err){

        console.error("An error occured while getting sub flow data by flow id : ",err);
        return {flowData : [],botName:null,botDescription:null};
    }
}


const getUserIdBySubFlowId=async(id:string)=>{
    
    try{

        const result=await db.sequelize.query(`
            SELECT userId,flowId FROM subFlows WHERE id=:id AND isDeleted='0';`,
            {
                replacements:{id},
                type:QueryTypes.SELECT
            }
        
        )

        if(result.length > 0 && 'userId' in result[0] && "flowId" in result[0]){

            return {userId : result[0].userId,flowId:result[0].flowId};
        }

        return null;
    }catch(err){
        console.error("An error occured while getting user ID by sub flow : ",err);
        return null;
    }
}


const getFlowDataFromDB=async(userId:string,slug:string)=>{

    try{

        const res=await db.sequelize.query(
            `SELECT 
            flows.json,flows.configData,
            COUNT(emails.id) as emailCount,
            flows.prompt,users.metaTokenData,
            campaigns.status,campaigns.audienceId,
            campaigns.template,campaigns.name,
            campaigns.keywords as keywordId,
            campaigns.emailId as campaignEmailIds,
            campaigns.timezone,campaigns.scheduledAt,
            crawl.keywords as keywords
            FROM flows 
            INNER JOIN users on users.id=flows.userId 
            INNER JOIN campaigns on campaigns.flowId=flows.id 
            LEFT JOIN emails on emails.userId=flows.userId AND emails.status='1'
            LEFT JOIN crawl on crawl.id=campaigns.keywords
            WHERE flows.userId=:userId AND flows.slug=:slug AND flows.isDeleted='0' ;`,
            {replacements:{userId,slug},type:QueryTypes.SELECT}
        )

        return res[0];
    }catch(err){
        console.error("An error occured : ",err);
        return null;
    }
    
}

const updateFlowDescriptionData=async(userId:string,slug:string,businessName:string,businessType:string,website:string,source:string):Promise<boolean>=>{


    try{

    await db.sequelize.query(
        `UPDATE flows 
        SET flows.json = JSON_SET(
            json,
            '$.product_name', :businessName,
            '$.leads', :source,
            '$.website', :website,
            '$.target', :businessType
        )
        WHERE flows.slug = :slug AND flows.userId = :userId`,
        {
            replacements: { userId, slug, businessName, businessType, source, website },
            type: QueryTypes.UPDATE,
        }
    );

    return true;

    }catch(err){
        console.error(err);
        return false;
    }
}


const updateSubFlowDB=async(userId:string,campaignId:string,flowData:string,flowShowData:string,type:string,slug:string) : Promise<boolean>=>{
    try{
        await db.sequelize.query(`UPDATE subFlows
            JOIN flows on flows.id=subFlows.flowId
            SET subFlows.flowData=:flowData,subFlows.flowShowData=:flowShowData,subFlows.campaignId=:campaignId
            WHERE subFlows.userId=:userId AND type=:type AND flows.slug=:slug`,
            {replacements:{userId,campaignId,slug,type,flowData,flowShowData,}}
        );
        return true;
    }catch(err){
        console.error(err);
        return false;
    }
}

const getSubflowsConfig=async(userId:string,slug:string)=>{

    try{

        const res=await db.sequelize.query(
            `SELECT 
    subFlows.configData,
    subFlows.id,
    CASE subFlows.type
        WHEN 1 THEN 'email'
        WHEN 2 THEN 'web'
        WHEN 3 THEN 'call'
        WHEN 4 THEN 'whatsapp'
        ELSE 'unknown'
    END AS type
    FROM subFlows 
    INNER JOIN flows ON flows.id = subFlows.flowId 
    WHERE 
    flows.userId = :userId 
    AND flows.slug = :slug 
    AND flows.isDeleted = '0';`,
            {replacements:{userId,slug},type:QueryTypes.SELECT}
        );

        return res;
    }catch(err){
        console.error(err);
        return null;
    }
}

export {upsertFlowConfig,getFlowConfigFromDB,getSubFlowDataFromDB,getParentFlowPrompt,saveSubFlowToDB,getAudiencesFromDB,saveFlowConfigDB,getFlowConfigDB,getCompanyIdByFlow,getFlowIdBySlug,getSubFlowData,getUserIdBySubFlowId,getFlowDataFromDB,updateFlowDescriptionData,updateSubFlowDB,getSubflowsConfig};
