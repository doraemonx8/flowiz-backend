import {type Request,type Response} from 'express';
import { getChatsByAdminId,createNewChat,getMessages,getUsersByUserIdList,setAgentHandover } from "../models/chats";
import mongoose from 'mongoose';


const getChats=async (req:Request,res:Response):Promise<any>=>{


    try{

        const {companyId,userId}=req.body;

        //getting chats from a company
        const chats=await getChatsByAdminId(userId);
        

        const userIds=chats.map((chat)=>{return chat.channel!=="web" ? chat.userId : null});

        //getting user details
        const users=await getUsersByUserIdList(userIds);

        //map users with chats
        users.forEach((user: any) => {
            const userId = String(user.id); 
            const chatMatches = chats.filter((chat) => String(chat.userId) === userId);
          
            chatMatches.forEach((chat) => {
              chat.userDetails = {
                name: user.name,
                contact: user.contact,
                email: user.email
              };
            });
          });

          return res.status(200).send({data:chats});
          


    }catch(err){


        console.error("An error occured while getting chats :",err);

        return res.status(500).send({status:false,message:"Unable to fetch chats right now."});
    }
}


const createChat=async(req:Request,res:Response):Promise<any>=>{


    try{

        const {companyId,userId,flowId}=req.body;

        const isNewChat=await createNewChat(companyId,userId,flowId);

        if(!isNewChat){

            return res.status(400).send({status:false,message:"Could not create a new chat right now"});
        }

        return res.status(200).send({status:true,message:"New chat created successfully"});

    }catch(err){

        console.error("An error occured while creating new chat :",err);
        return res.status(500).send({status:false,message:"Unable to create new chat right now."});
    }
}

//get lastest 20 messages for a chat
const getMessagesByChat=async(req:Request,res:Response):Promise<any>=>{

    try{


        const {chatId}=req.body;

        const messages=await getMessages(chatId);


        return res.status(200).send({status:true,data:messages});
    }catch(err){

        console.error("An error occured while getting messages for a chat : ",err);

        return res.status(500).send({status:false,message:"Unable to get messages for this chat."});
    }
}


//handover to agent
const agentHandover=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {chatId,companyId,isHandover}=req.body;

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
            return res.status(400).json({ error: 'Invalid chat ID' });
        }

        const isAgentHandover=await setAgentHandover(chatId,isHandover,companyId);

        if(!isAgentHandover){

            return res.status(500).send({status:false,message:"Could not transfer this chat to you. Try again"});
        }

        return res.status(200).send({status:true,message:"Chat transferred to you"});
    }catch(err){

        console.error(`An error occured while handing over to agent : `,err);

        return res.status(500).send({status:false,message:"Unable to transfer this chat to you."});
    }
}


export {getChats,createChat,getMessagesByChat,agentHandover};
