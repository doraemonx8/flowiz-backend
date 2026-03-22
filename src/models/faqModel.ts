import db from "../models/conn";
import { QueryTypes } from "sequelize";


const getFAQ=async(userId : string,flowId : string)=>{

    try{

        const res=await db.sequelize.query("SELECT id,question,answer,isFile FROM FAQ WHERE userId=:userId AND flowId=:flowId AND isDeleted='0'",
            {
                replacements:{userId,flowId},
                type:QueryTypes.SELECT
            }
        )

        return res;
    }catch(err){
        console.error(err);
        return [];
    }
}

const getFaqById=async(userId:string,id:string)=>{

    try{

        const res=await db.sequelize.query("SELECT vectorId,flowId,question,answer FROM FAQ WHERE id=:id AND userId=:userId AND isDeleted='0'",
            {
                replacements:{userId,id},
                type:QueryTypes.SELECT
            }
        );

        return res;
    }catch(err){
        console.error(err);
        return null;
    }
}

const updateFAQById=async(userId:string,id:string,question:string,answer:string)=>{
    try{

        await db.sequelize.query("UPDATE FAQ SET question=:question, answer=:answer WHERE id=:id AND userId=:userId AND isDeleted='0'",
            {
                replacements:{userId,id,question,answer},
                type:QueryTypes.UPDATE
            }
        );
        return true;
    }catch(err){
        console.error(err);
        return false;
    }
}
const deleteFAQById=async(id:string,userId:string)=>{
    try{

        await db.sequelize.query("UPDATE FAQ SET isDeleted='1' WHERE id=:id AND userId=:userId AND isDeleted='0'",
            {
                replacements:{id,userId},
                type:QueryTypes.UPDATE
            }
        );

        return true;
    }catch(err){
        console.error(err);
        return false;
    }
}


const deleteFAQDoc=async(userId:string,flowId:string,fileName:string)=>{

    try{

        await db.sequelize.query("UPDATE FAQ SET isDeleted='1' WHERE userId=:userId AND flowId=:flowId AND question=:fileName AND isDeleted='0' AND isFile='1'",
            {
                replacements:{userId,flowId,fileName},
                type:QueryTypes.UPDATE
            }
        );

        return true;
    }catch(err){
        console.error(err);
        return false;
    }
}

const InsertFAQ=async(userId:string,flowId:string,vectorId:string,question:string,answer:string,isFile:boolean=false)=>{
    const t=await db.sequelize.transaction();
    try{
        
        await db.sequelize.query("INSERT INTO FAQ (userId,flowId,vectorId,question,answer,isFile) VALUES (:userId,:flowId,:vectorId,:question,:answer,:isFile)",
            {
                replacements:{userId,vectorId,question,answer,flowId,isFile : isFile ? "1" :"0"},
                transaction:t,
                type:QueryTypes.INSERT
            }
        );


        // await db.sequelize.query("INSERT INTO ledger (user_id,description,type) VALUES(:userId,'FAQ Added','faq')",{
        //     replacements:{userId},
        //     transaction:t,
        //     type:QueryTypes.INSERT
        // });


        await t.commit();
        return true;
    }catch(err){
        await t.rollback();
        console.error(err);
        return false;
    }
}
export {getFAQ,getFaqById,deleteFAQById,updateFAQById,InsertFAQ,deleteFAQDoc};