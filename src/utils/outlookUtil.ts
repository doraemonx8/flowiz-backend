import {saveTokensInDB,getTokensFromDB} from "../models/userModel";

import axios from "axios";

import { AccountInfo, ConfidentialClientApplication, Configuration } from "@azure/msal-node";

import {msalConfig,GRAPH_SCOPES} from "../third-party/outlookConfig";

const refreshAccessToken=async(userId:string,refreshToken:AccountInfo)=>{

    try{

        const cca=new ConfidentialClientApplication(msalConfig as Configuration);

        //getting access token
        const token=await cca.acquireTokenSilent({
            account:refreshToken,
            scopes:GRAPH_SCOPES
        });

        if(!token){

            return null;
        }
        //saving
        await saveTokensInDB(userId,'outlook',{access_token:token.accessToken,refresh_token:refreshToken,expiry_date:token.expiresOn as unknown as string});

        return token.accessToken;
    }catch(err){
        console.error(err);
        return null;

    }
}


const getAccessToken=async(userId:string)=>{

    try{

        const tokens=await getTokensFromDB(userId,'outlook');

        const now = Date.now();
        const expiryTime = Date.parse(tokens.expiryDate) || 0;
        const bufferTime = 5 * 60 * 1000; 

        if (expiryTime > now + bufferTime) {

            return tokens.accessToken;
        }

        console.log("Access token expired, refreshing...");
        
        if (!tokens.refreshToken) {
            console.log("No refresh token available");
            return null;
        }

        const accessToken = await refreshAccessToken(userId, tokens.refreshToken);
        
        if (accessToken) {
            return accessToken;
        }

        return null;
    }catch(err){

        console.error(err);
        return null;
    }
}



const sendOutlookMail = async (userId: string, params: Record<string, any>) => {
  try {
    const accessToken = await getAccessToken(userId);
    const url = `https://graph.microsoft.com/v1.0/me/sendMail`;

    const payload = {
      message: {
        subject: params.subject,
        body: {
          contentType: "Text",
          content: params.body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.to,
            },
          },
        ],
      },
    };

    const result = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return { status: true, data: result.data };
  } catch (err: any) {
    console.error("An error occurred while sending Outlook mail:", err.response?.data || err.message);
    return { status: false, message: err.message };
  }
};


const listMail=async(userId:string)=>{

    try{

        const accessToken=await getAccessToken(userId);

        const res=await axios.get("GET https://graph.microsoft.com/v1.0/me/messages",{
            headers:{"Authorization":`Bearer ${accessToken}`,"Content-Type": "application/json",}
        });

        return { status: true, data: res.data.value };
    }catch(err:any){

        console.error("An error occured while getting mails : ",err);
        return {status:true,message:err.message};
    }
}


export {getAccessToken,sendOutlookMail,listMail};