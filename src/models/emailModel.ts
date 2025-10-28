import db from "../models/conn";
import { QueryTypes } from 'sequelize';
import Chat from "./schema";


const saveEmail = async (userId: string,type: string,email:string): Promise<boolean> => {
  try {

    //checking if email is already present

    const res=await db.sequelize.query('SELECT id FROM emails WHERE userId=:userId AND email=:email',{
      replacements:{userId,email},
      type:QueryTypes.SELECT
    });

    if(res.length > 0){
      return true;
    }
    const query = `
      INSERT INTO emails (userId, type, email)
      VALUES (:userId,:type,:email)
    `;

    await db.sequelize.query(query, {
      replacements : {userId,type,email},
      type: QueryTypes.INSERT,
    });

    return true;
  } catch (err) {
    console.error("Error in batch insert:", err);
    return false;
  }
};


const getGoogleHistoryId=async(email:string)=>{

  try{

    const res=await db.sequelize.query(`SELECT googleTokenData,users.id,users.companyId from users INNER JOIN emails on emails.userId=users.id WHERE emails.email=:email`,
      {
        replacements:{email},
        type:QueryTypes.SELECT
      }
    )

    if ('id' in res[0] && 'googleTokenData' in res[0] && 'companyId' in res[0] ){

      return {userId:res[0].id,companyId:res[0].companyId,historyId:JSON.parse(res[0].googleTokenData as string).historyId};
    }

    return {userId : null,historyId:null};

  }catch(err){

    console.error("An error occured while getting previous history :",err);
    return {userId : null,historyId:null};
  }
}


const getEmailHistory=async(userId:string,email:string)=>{

  try{

    const res=await db.sequelize.query("SELECT history FROM emails WHERE email=:email AND userId=:userId AND isDeleted='0'",
      {
        replacements:{userId,email},
        type:QueryTypes.SELECT
      }
    );

    if('history' in res[0]){
      return res[0].history;
    }

    return null;
  }catch(err){

    console.error(err);
    return null;
  }
}

const updateEmailChat=async(chatId:string,params:Record<string,any>)=>{

  try{

    await Chat.findByIdAndUpdate(chatId,params);
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}
// const isEmailChatPresent=async(threadId:string,userId:string):Promise<boolean>=>{

//   try{

//     const chat=await Chat.findOne({
//       channel:"email",
//       threadId,
//       adminId:userId
//     });

//     if(chat){
//       return true;
//     }


//     return false;
//   }catch(err){

//     console.error("An error occured while checking email chat : ",err);
//     return false;
//   }
// }


const isEmailChatPresent=async(userId:string,leadId:string,companyId:string,flowId:string)=>{

  try{

    const chat=await Chat.findOne({
      channel:"email",
      adminId:userId,
      userId:leadId,
      companyId,
      flowId
    });

    return chat?._id;
  }catch(err){

    console.error(err);
    return false;
  }
}

const isEmailChatByMessageId=async(messageId:string,currMessageId:string)=>{

  try{


  const chat = await Chat.aggregate([
  {
    $unwind: "$messages"
  },
  {
    $match: { 
      "messages.messageId": messageId
    }
  },
  {
    $match: { 
      "messages.messageId": { $ne: currMessageId }
    }
  }
]);


  return chat[0];
  }catch(err){
    console.error(err);
    return false;
  }
}

// const addMailMessage=async(threadId:string,userId:string,subject:string,body:string,messageId:string)=>{

//   try{

//     const chat=await Chat.findOneAndUpdate(
//   {
//     channel: "email",
//     threadId,
//     adminId: userId,
//   },
//   {
//     $push: {
//       messages: {
//         isBot:false,
//         isAgent:false,
//         createdOn:new Date().getTime(),
//         subject,
//         message:body,
//         messageId
//       },
//     },
//   },
//   {new:true}
// );

// if(chat){
//   return chat._id;
// }
// return false;
//   }catch(err){

//     console.error("An error occured while adding mail message : ",err);
//     return false;
//   }
// }


const addMailMessage=async(chatId:string,messageObj:Record<string,any>)=>{

  try{

    const chat=await Chat.findOneAndUpdate(
  {
    channel: "email",
    _id:chatId
  },
  {
    $push: {
      messages:messageObj
    },
  },
  {new:true}
);

if(chat){
  return chat._id;
}
return false;
  }catch(err){

    console.error("An error occured while adding mail message : ",err);
    return false;
  }
}


const getAllEmailsDB=async(userId:string)=>{

  try{

    const res=await db.sequelize.query(`SELECT 
    emails.id,
    emails.email,
    emails.password,
    emails.type,
    emails.status,
    campaigns.id AS campaignId,
    campaigns.name,
    campaigns.createdOn
FROM emails
LEFT JOIN campaigns  
    ON FIND_IN_SET(emails.id, campaigns.emailId) > 0
    AND campaigns.createdOn = (
        SELECT MAX(c2.createdOn)
        FROM campaigns c2
        WHERE FIND_IN_SET(emails.id, c2.emailId) > 0
    )
WHERE 
    emails.userId =:userId
    AND emails.isDeleted = '0';`,
      {
        replacements:{userId},
        type:QueryTypes.SELECT
      }
    );

    return res;
  }catch(err){
    console.error(err);
    return [];
  }
}

const insertEmail=async(userId:string,type:string,email:string,password:string)=>{

  try{

    //checking if email exists
    await db.sequelize.query('INSERT INTO emails (userId,email,type,password) VALUES(:userId,:email,:type,:password)',
      {
        replacements:{userId,type,email,password},
        type:QueryTypes.INSERT
      }
    );


    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}


const deleteMailDB=async(email:string,userId:string)=>{

  try{

    await db.sequelize.query("UPDATE emails SET isDeleted='1' WHERE email=:email AND userId=:userId",
      {
        replacements:{userId,email},
        type:QueryTypes.UPDATE
      }
    )

    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}


const updateEmailData=async(params:Record<string,string>,userId:string,email:string,subscriptionId:string | null =null )=>{

  const t=await db.sequelize.transaction();

  try{

    const query=Object.keys(params).map((key : string)=> `${key} =:${key}`).join(",");
    await db.sequelize.query(`UPDATE emails SET ${query} WHERE userId=:userId AND emails.email=:email AND emails.isDeleted='0' `,
      {
        replacements:{...params,userId,email},
        type:QueryTypes.UPDATE
      }
    )

    if(params.status==='1'){ //adding in ledger only when email has been verified

        await db.sequelize.query("INSERT INTO ledger (userId,subscriptionId,message,type) VALUES(:userId,:subscriptionId,'Email account added','emailAccount')",
        {
          replacements:{userId,subscriptionId},
          transaction:t,
          type:QueryTypes.INSERT
        }
      )
    }

    await t.commit();
    return true;
  }catch(err){
    await t.rollback();
    console.error(err);
    return false;
  }
}

const getEmailData=async(userId:string,email:string)=>{

  try{

    const res=await db.sequelize.query("SELECT password,type FROM emails WHERE userId=:userId AND email=:email AND isDeleted='0'",
      {
        replacements:{userId,email},
        type:QueryTypes.SELECT
      }
    );

    if(res.length && 'password' in res[0] && 'type' in res[0]){
      return {password:res[0].password, type:res[0].type};
    }
    
    return null;
  }catch(err){
    console.error(err);
    return null;
  }
}

const getAllVerifiedEmails=async(userId:string,emailIds:string="")=>{

  try{

    const res=await db.sequelize.query(`SELECT id,email,type,password FROM emails WHERE userId=:userId AND status='1' AND isDeleted='0' ${emailIds ? "AND id IN (:emailIds)" : ""} ORDER BY createdOn DESC`,
      {
        replacements:{userId,...(emailIds ? { emailIds: emailIds.split(",") } : {})},
        type:QueryTypes.SELECT
      }
    );

    return res;
  }catch(err){
    console.error(err);
    return [];
  }
}


const getEmailSignature=async(userId:string,campaignId:string)=>{

  try{

    const res : any=await db.sequelize.query("SELECT subFlows.configData FROM subFlows INNER JOIN campaigns on campaigns.flowId=subFlows.flowId WHERE subFlows.userId=:userId AND subFlows.type='1' AND subFlows.isDeleted='0' ORDER BY subFlows.createdOn DESC LIMIT 1",
      {
        replacements:{userId,campaignId}
      }
    );


    if('configData' in res[0][0]){

      return JSON.parse(res[0][0]['configData'] as string).signature;
    }

    return null;
  }catch(err){

    console.error(err);
    return null;
  }
}

export {saveEmail,getGoogleHistoryId,isEmailChatPresent,addMailMessage,getAllEmailsDB,insertEmail,deleteMailDB,updateEmailData,getEmailHistory,isEmailChatByMessageId,updateEmailChat,getEmailData,getAllVerifiedEmails,getEmailSignature};
