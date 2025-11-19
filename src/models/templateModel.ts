import db from "../models/conn";
import { QueryTypes } from "sequelize";




interface UserNumberToken{
    phoneNumberId:string,
    metaToken:string
}


interface TemplateJSON{

    templateJson:string
}

const getWABAIDAndToken=async(userId:string)=>{

    try{

        const users = await db.sequelize.query(
            `SELECT metaTokenData 
             FROM users 
             WHERE users.id = :userId
            AND users.isDeleted='0'
                `,
            {
                replacements: { userId },
                type: QueryTypes.SELECT,
            }
        );


        if('metaTokenData' in users[0]){

            const wabaID=JSON.parse(users[0].metaTokenData as string).wabaId;
            const token=JSON.parse(users[0].metaTokenData as string).access_token;
            const phoneNumberId=JSON.parse(users[0].metaTokenData as string).phoneNumberId;
            return {wabaID,token,phoneNumberId};
        }

        return null;
       

        


    }catch(err){

        console.error("An error occured while getting WABA ID from DB : ",err);
        return null;
    }
}


const getPhoneNumberIdAndToken=async(userId:string)=>{

    try{

        const user:UserNumberToken[]=await db.sequelize.query(
            `SELECT metaTokenData
            FROM users
            WHERE users.id=:userId
            AND users.isDeleted='0'`,
            {
                replacements:{userId},
                type:QueryTypes.SELECT
            }
        );

        if('metaTokenData' in user[0]){

            const phoneNumberId=JSON.parse(user[0].metaTokenData as string).phoneNumberId;
            const token=JSON.parse(user[0].metaTokenData as string).token;

            return {phoneNumberId,token};
        }

        return null;
        
    }catch(err){

        console.error("An error occured while getting phone number ID and token :",err);
        return null;
    }
}


const getUserTemplates=async(userId:string)=>{
    try{
        const templates=await db.sequelize.query(
            `SELECT id,name,status,templateJson,type,templateFor,createdOn,modifiedOn
            FROM templates
            WHERE templates.userId=:userId
            AND templates.isDeleted='0'
            ORDER BY templates.id DESC`,
            {
                replacements:{userId},
                type:QueryTypes.SELECT,
            }
        );
        return templates;
    }catch(err){


        console.error("An error occured while getting templates from DB : ",err);
        return [];
    }
}



const saveTemplateToDB=async(data:string,name:string,templateFor:string,userId:string,type:string,companyId:string)=>{


    try{

        await db.sequelize.query(
            `INSERT INTO templates (userId,companyId,name,templateJson,templateFor,type)
             VALUES(:userId,:companyId,:name,:data,:templateFor,:type)`,
            {
                replacements: { data,name,templateFor, type,userId,companyId },
                type: QueryTypes.INSERT
            }
        );


        return true;
    }catch(err : any){

        console.error("An error occured while saving template to DB : ",err.message);
        return false;
    }
}


const getTemplateByID=async(templateId:string,userId:string)=>{

    try{

        const data:TemplateJSON[]=await db.sequelize.query(
            `SELECT templateJson
            FROM templates
            WHERE templates.userId=:userId
            AND templates.id=:templateId
            AND templates.isDeleted='0'`,
            {
                replacements:{templateId,userId},
                type:QueryTypes.SELECT
            }
        )

        return data;
    }catch(err:any){

        console.error("An error occured while getting template by ID : ",err.message);
        return null;
    }
}

const updateMetaTemplateStatus = async (statusArray: Array<{ id: string; status: string }>) => {
    if (statusArray.length === 0) return true;

    try {
        const ids = statusArray.map(item => item.id);
        

        const caseStatement = statusArray
            .map(item => `WHEN id = ${item.id} THEN '${item.status}'`)
            .join(' ');

        const query = `
            UPDATE templates
            SET templateJSON = JSON_SET(templateJSON, '$.status',
                CASE 
                    ${caseStatement}
                END
            )
            WHERE id IN (${ids.join(',')})
        `;

        await db.sequelize.query(query, {
            type: QueryTypes.UPDATE,
        });

        return true;
    } catch (err) {
        console.error("An error occurred: ", err);
        return false;
    }
};




export {getWABAIDAndToken,getUserTemplates,saveTemplateToDB,getTemplateByID,getPhoneNumberIdAndToken,updateMetaTemplateStatus};