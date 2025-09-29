import {type Request,type Response} from 'express';

import keys from "../third-party/client_secret";
import { saveTokensInDB,updateHistoryId } from '../models/userModel';

import { google } from "googleapis";
import { saveGoogleMail,setupGmailWatch,getGmailMessage } from '../utils/googleUtil';

import {getGoogleHistoryId} from "../models/emailModel";

const getAuthURL = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.body;

    const {slug}=req.query;

    const oauth2Client = new google.auth.OAuth2(
      keys.web.client_id,
      keys.web.client_secret,
      "https://cybernauts.one/alpha16/google/connect"
    );

    const scopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send", 
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", 
      prompt: "consent", 
      scope: scopes,
      state: JSON.stringify({ userId,slug })
    });

    return res.status(200).send({ status: true, url: authUrl });
  } catch (err : any) {
    console.error("Error generating Google Auth URL:", err.response);
    return res.status(500).send({ status: false, message: "Could not generate auth URL" });
  }
};




const connectGoogle = async (req: Request, res: Response): Promise<any> => {
    try {
        const { code, state } = req.query;


        if (!code || !state) {
            return res.status(400).send({ status: false, message: "Missing auth code or state" });
        }

        const {userId,slug} = JSON.parse(state as string);
       

        const authClient = new google.auth.OAuth2(
            keys.web.client_id,
            keys.web.client_secret,
            "https://cybernauts.one/alpha16/google/connect"
        );

        const { tokens } = await authClient.getToken(code as string);

        if (!tokens.access_token || !tokens.expiry_date) {
            throw new Error("Missing required tokens");
        }


        const googleWatch=await setupGmailWatch(tokens.access_token);

        if(!googleWatch){

          throw new Error("Invalid watch");
        }


        const isSaved = await saveTokensInDB(userId, 'google', {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            expiry_date: tokens.expiry_date,
            historyId:googleWatch.historyId,
            watch_expiry:googleWatch.expiration
        });

        saveGoogleMail(userId,tokens.access_token);

        if (!isSaved) {
            return res.status(400).send({ status: false, message: "Could not save tokens. Try again" });
        }

        return res.redirect(`https://agent.flowiz.biz/flows/${slug}?message=Google%20account%20connected`);
    } catch (err) {
        console.error("An error occured while connecting google account:", err);
        return res.status(500).send({ status: false, message: "Could not connect. Try again later" });
    }
};


const googleWebhook=async(req:Request,res:Response):Promise<any>=>{

  try{

    const encodedData=req.body.message.data;
    const decodedData = Buffer.from(encodedData, 'base64').toString('utf-8');
    const notification = JSON.parse(decodedData);

    //updating history id
    const {userId,historyId,companyId}=await getGoogleHistoryId(notification.emailAddress);
    
   
    await getGmailMessage(userId as string,notification.emailAddress,historyId,companyId as string);
    await updateHistoryId(notification.emailAddress,notification.historyId);

    return res.status(200).send({status:true,message:"Thanks for the update"});

  }catch(err){

    console.error("An error occured : ",err);
    return res.status(500).send({status:false,message:"Some error in webhook. Check logs"});
  }
}




export {connectGoogle,getAuthURL,googleWebhook};
