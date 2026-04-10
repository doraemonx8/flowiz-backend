import db from "../models/conn";
import { QueryTypes } from "sequelize";
import { LeadData } from "../utils/channelWorkerUtil"

const saveLeads = async (data: any[], companyId: string, audience: string, userId: string) => {
  const t = await db.sequelize.transaction();

  try {
    if (!data.length) {
      await t.commit();
      return true;
    }

    // Insert audience
    const [insertResult]: any = await db.sequelize.query(
      'INSERT INTO audience (userId, companyId, name) VALUES (:userId, :companyId, :name)',
      {
        replacements: { userId, companyId, name: audience },
        transaction: t,
        type: QueryTypes.INSERT,
      }
    );

    const audienceId = insertResult;

    const leadPlaceholders: string[] = [];
    const leadValues: any[] = [];

    const masterPlaceholders: string[] = [];
    const masterValues: any[] = [];

    data.forEach((lead: any) => {
      if (lead.phone || lead.email) {

        // leads (6 columns)
        leadPlaceholders.push(`(?, ?, ?, ?, ?, ?)`);
        leadValues.push(
          companyId,
          audienceId,
          lead.name || "",
          lead.email || "",
          lead.phone || "",
          lead.website || ""
        );

        // masterLeads (5 columns)
        masterPlaceholders.push(`(?, ?, ?, ?, ?)`);
        masterValues.push(
          lead.name || "",
          lead.email || "",
          lead.phone || "",
          lead.website || "",
          lead.types || ""
        );
      }
    });

    if (leadValues.length > 0) {
      await db.sequelize.query(
        `INSERT INTO leads (companyId, audienceIds, name, email, phone, website)
         VALUES ${leadPlaceholders.join(', ')}`,
        {
          replacements: leadValues,
          transaction: t,
          type: QueryTypes.INSERT,
        }
      );

      await db.sequelize.query(
        `INSERT INTO masterLeads (name, email, phone, website, industry)
         VALUES ${masterPlaceholders.join(', ')}`,
        {
          replacements: masterValues,
          transaction: t,
          type: QueryTypes.INSERT,
        }
      );
    }

    // Update crawl
    await db.sequelize.query(
      `UPDATE crawl 
       SET audienceId = :audienceId, status = '1'
       WHERE userId = :userId AND keywords = :keywords`,
      {
        replacements: { userId, audienceId, keywords: audience },
        transaction: t,
        type: QueryTypes.UPDATE,
      }
    );

    await t.commit();
    return true;

  } catch (err) {
    await t.rollback();
    console.error("An error occurred:", err);
    return false;
  }
};


const getLeadMail=async(id:string)=>{
    try{
        const result=await db.sequelize.query("SELECT leads.email FROM leads WHERE id=:id AND isDeleted='0'",
            {
                replacements:{id},
                type:QueryTypes.SELECT
            }
        );
        if('email' in result[0]){
            return result[0].email;
        }
        return null;
    }catch(err : any){
        console.error("An error occured while getting lead mail : ",err.message);
        return null;
    }
}

const getLeadData = async (leadId: string): Promise<LeadData> => {
  try {
    const result = await db.sequelize.query<any>(
      `SELECT id, name, email, phone FROM leads WHERE id = :leadId AND isDeleted = '0' LIMIT 1`,
      { replacements: { leadId }, type: QueryTypes.SELECT }
    );
    if (result.length > 0) {
      const r = result[0];
      return { id: r.id, name: r.name || "", email: r.email || "", phone: r.phone || "" };
    }
    return { id: leadId, name: "", email: "", phone: "" };
  } catch (err) {
    console.error("getLeadData error:", err);
    return { id: leadId, name: "", email: "", phone: "" };
  }
};

const transferLeadsFromMaster=async(userId:string,companyId:string)=>{
    try{
        const [audienceInsertResult] = await db.sequelize.query(
        `INSERT INTO audience (userId, companyId, name) 
        VALUES (:userId, :companyId, 'Unlocked Audience')`,
        {
            replacements: { userId, companyId },
            type: QueryTypes.INSERT,
        }
        );
        const audienceId = audienceInsertResult; 
        await db.sequelize.query(
        `INSERT INTO leads (companyId, name, email, phone, audienceIds)
        SELECT :companyId, name, email, phone, :audienceId
        FROM masterLeads LIMIT 50`,
        {
            replacements: {
            companyId,
            audienceId
            },
            type: QueryTypes.INSERT,
        }
        );
        return {audienceId,name:"Unlocked Audience"};

    }catch(err){
        console.error(err);
        return {};
    }
}


const checkAudience=async(userId:string,keywordId:string)=>{
    try{
        const res=await db.sequelize.query("SELECT audienceId,keywords,nextPageToken from crawl WHERE userId=:userId AND id=:keywordId AND isDeleted='0' AND status='1' ORDER BY createdOn DESC",
            {
                replacements:{userId,keywordId},
                type:QueryTypes.SELECT

            }
        );
        if(res.length && 'audienceId' in res[0] && 'keywords' in res[0] && "nextPageToken" in res[0]){
            return {audienceId:res[0].audienceId || -1,audienceName:res[0].keywords,token:res[0].nextPageToken};
        }
        return {audienceId:false,audienceName:"",token:null};
    }catch(err){
        console.error(err);
        return {audienceId:false,audienceName:"",token:null};
    }
}



const updateCrawl=async(userId:string,status:string,keywords:string,nextPageToken:string)=>{
    try{
        await db.sequelize.query("UPDATE crawl SET status=:status,nextPageToken=:nextPageToken WHERE userId=:userId AND keywords=:keywords",
            {
                replacements: { 
                    userId, 
                    keywords, 
                    status, 
                    nextPageToken: nextPageToken || null // Fallback to null if undefined
                },
                type:QueryTypes.UPDATE
            }
        )

        return true;
    }catch(err){
        console.error(err);
        return false;
    }
}

export {saveLeads,getLeadMail,getLeadData,transferLeadsFromMaster,checkAudience,updateCrawl};



