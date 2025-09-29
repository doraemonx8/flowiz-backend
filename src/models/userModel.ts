import db from "../models/conn";
import { QueryTypes } from "sequelize";


const saveTokensInDB=async(userId : string,type:string,data:Record<string,any>)=>{

    try{

        await db.sequelize.query(
            `UPDATE users SET ${type}TokenData=:data WHERE id=:userId`,
            {
                replacements:{userId,data : JSON.stringify(data)},
                type:QueryTypes.INSERT
            }
        );

        return true;

    }catch(err){
        console.error(err);
        return false;
    }
}


interface TokenRow {
    [key: string]: any;
}

const getTokensFromDB = async (userId: string, type: string) => {
    try {
        const res = await db.sequelize.query<TokenRow>(
            `SELECT ${type}TokenData FROM users WHERE id=:userId`,
            {
                replacements: { userId },
                type: QueryTypes.SELECT
            }
        );

        const key = `${type}TokenData`;

        if (res.length > 0 && key in res[0]) {
            const tokens = JSON.parse((res[0] as TokenRow)[key]);

            return {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiryDate: tokens.expiry_date
            };
        }

        return { accessToken: null, refreshToken: null, expiryDate: null };

    } catch (err) {
        console.error(err);
        return { accessToken: null, refreshToken: null, expiryDate: null };
    }
};


const updateHistoryId=async(email:string,historyId:string)=>{

    try{

        const userResult : any = await db.sequelize.query(
            `SELECT users.id FROM users 
            INNER JOIN emails ON emails.userId = users.id 
            WHERE emails.email = :email`,
            {
                replacements: { email },
                type: QueryTypes.SELECT
            }
        );

        if (!userResult.length) {
            return null; 
        }

        const userId = userResult[0]?.id;
        await db.sequelize.query(
                    `UPDATE users 
                    INNER JOIN emails ON emails.userId = users.id
                    SET users.googleTokenData = JSON_SET(users.googleTokenData, '$.historyId', :historyId)
                    WHERE emails.email = :email;`,
                    {
                        replacements: { email, historyId },
                        type: QueryTypes.UPDATE
                    }
                );
        return userId;

    }catch(err){

        console.error("An error occured while updating history : ",err);
        return null;
    }
}


  

  const getUserEmails = async (userId: string | number,flowId:string | null) => {
    try {
      const res = await db.sequelize.query(
        `
        SELECT emails.email as userEmail,emails.type,emails.password,subFlows.configData
        FROM emails 
        INNER JOIN 
        subFlows ON
        subFlows.userId=emails.userId
        WHERE emails.userId = :userId
        AND emails.isDeleted = '0'
        AND emails.status='1'
        AND subFlows.id=:flowId
        `,
        {
          replacements: { userId,flowId },
          type: QueryTypes.SELECT,
        }
      );
  
      return res;
    } catch (err) {
      console.error("An error occurred while getting user emails:", err);
      return [];
    }
  };


  const getUserEmailByCampaign=async(campaignId:string,userId:string,flowId:string)=>{

    try{

        const res=await db.sequelize.query(`
            SELECT emails.email as userEmail,emails.type,emails.password,subFlows.configData
            FROM emails
            INNER JOIN
            campaigns ON
            campaigns.emailId=emails.id
            INNER JOIN subFlows ON
            subFlows.userId=campaigns.userId
            WHERE emails.userId=:userId
            AND campaigns.userId=:userId
            AND emails.isDeleted='0'
            AND emails.status='1'
            AND subFlows.id=:flowId
            AND campaigns.id=:campaignId`,
        {
            replacements:{userId,campaignId,flowId},
            type:QueryTypes.SELECT
        });

        return res[0];
    }catch(err){
        console.error(err);
        return {}
    }
  }


  const removeTokensFromDB=async(userId:string,type:string)=>{

    try{

        await db.sequelize.query(`UPDATE users SET ${type}TokenData='' WHERE userId=:userId`,{
            replacements:{userId},
            type:QueryTypes.UPDATE
        });


        return true;
    }catch(err){

        console.error(err);
        return false;
    }
  }


export {saveTokensInDB,getTokensFromDB,updateHistoryId,getUserEmails,removeTokensFromDB,getUserEmailByCampaign};
