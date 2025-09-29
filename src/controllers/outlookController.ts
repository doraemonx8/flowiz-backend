import { Request,Response } from "express";

import { ConfidentialClientApplication, Configuration } from "@azure/msal-node";

import {msalConfig,GRAPH_SCOPES} from "../third-party/outlookConfig";

import { saveTokensInDB } from "../models/userModel";

import { saveEmail } from "../models/emailModel";

import axios from "axios";

const cca=new ConfidentialClientApplication(msalConfig as Configuration);

const getAuthURL=async(req:Request,res:Response) : Promise<any>=>{

    try{

        const {userId}=req.body;
        const state = encodeURIComponent(JSON.stringify({ userId }));
        
        

           const authCodeUrlParameters = {
            scopes: GRAPH_SCOPES,
            redirectUri: msalConfig.auth.redirectUri,
            state,
        };

        const url= await cca.getAuthCodeUrl(authCodeUrlParameters);

        return res.status(200).send({status:true,url});
    }catch(err){

        console.error("An error occured in outlook : ",err);
        return res.status(500).send({status:false,message:"Could not connect outlook. Try again"});
    }
}


const connectOutlook=async(req:Request,res:Response) : Promise<any>=>{

    const {code,state}=req.query;

    if(!code){

        return res.status(400).send('Authorization code not found.');
    }


    try{

        const tokenRequest = {
            code : code as string,
            scopes: GRAPH_SCOPES,
            redirectUri: msalConfig.auth.redirectUri,
        };


        const tokens=await cca.acquireTokenByCode(tokenRequest);

        const userId=JSON.parse(decodeURIComponent(state as string)).userId;
        //saving tokens in DB
       const isSaved= await saveTokensInDB(userId,'outlook',{access_token:tokens.accessToken,refresh_token:tokens.account,expiry_date:tokens.expiresOn as unknown as string});

         if(!isSaved){

            return res.status(400).send({status:false,message:"Could not save tokens. Try again"});
        }

        saveOutlookMail(userId,tokens.accessToken);
        return res.redirect("http://localhost:3000/home?message='Outlook account connected'");

    }catch(err){

        console.error(err);
        return res.status(500).send({status:true,message:"Could not connect outlook. Try again"});
    }
}



const saveOutlookMail = async (userId: string, accessToken: string): Promise<boolean> => {
  try {
    const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const email = response.data.mail || response.data.userPrincipalName;

    if (!email) {
      console.warn('No email found in Microsoft Graph user profile');
      return false;
    }

    await saveEmail(userId, 'outlook', email);

    return true;
  } catch (err) {
    console.error('An error occurred while saving Outlook email:', err);
    return false;
  }
};

export { saveOutlookMail };


export {getAuthURL,connectOutlook};