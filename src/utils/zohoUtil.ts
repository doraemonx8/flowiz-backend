
import {saveTokensInDB,getTokensFromDB} from "../models/userModel";

import axios from "axios";



const refreshAccessToken=async(userId : string,refreshToken : string)=>{


    try{

        const url=`https://accounts.zoho.com/oauth/v2/token?refresh_token=${refreshToken}&grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}`;

        const res=await axios.post(url);

        const {access_token,expires_in}=res.data;


        //saving
        await saveTokensInDB(userId,'zoho',{access_token,refresh_token:refreshToken,expiry_date:expires_in});

        return access_token;
    }catch(err){

        console.error("An error occured while getting new access token : ",err);
        return null;
    }
}

const getAccessToken=async(userId:string)=>{

    const tokens=await getTokensFromDB(userId,'zoho');

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

}



const sendZohoMail=async(userId : string,params : Record<any,any>)=>{

    try{

        const accessToken=await getAccessToken(userId);


        const url=`https://mail.zoho.com/api/accounts/${params.accountId}/messages`;

        const payload={
                "fromAddress":params.from,
                "toAddress":params.to,
                "subject":params.subject,
                "content":params.body
            }
        const res=await axios.post(url,payload,{
            headers:{"Authorization" :`Zoho-oauthtoken ${accessToken}`},
        });


        return true;
    }catch(err : any){

        console.error("An error occured while sending mail from zoho : ",err);
        return {status:false,message:err.message};
    }
}


export {getAccessToken,sendZohoMail};
