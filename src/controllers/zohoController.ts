import {type Request,type Response} from 'express';
import axios from "axios";

import { saveTokensInDB } from '../models/userModel';

import { getAccessToken } from '../utils/zohoUtil';

import { saveEmail } from '../models/emailModel';

const getAuthURL=async(req:Request,res:Response):Promise<any>=>{


    try{

        const userId = req.body.userId;
        const state = encodeURIComponent(JSON.stringify({ userId }));

        const scope="ZohoMail.messages.READ,ZohoMail.accounts.READ,ZohoMail.messages.CREATE,aaaserver.profile.READ";

        const redirectURI='https://cybernauts.online/alpha16/zoho/connect';

        const url=`https://accounts.zoho.in/oauth/v2/auth?client_id=${process.env.ZOHO_CLIENT_ID}&response_type=code&redirect_uri=${redirectURI}&scope=${scope}&access_type=offline&state=${state}`;

        return res.status(200).send({status:true,url});
    }catch(err){

        console.error("An error occured while getting zoho auth url : ",err);
        return res.status(500).send({status : false,message:"Could not auth zoho."});
    }
}

const connectZoho = async (req: Request, res: Response): Promise<any> => {
    try {
        const code = req.query.code as string;
        const state = req.query.state as string;

        if (!code) return res.status(400).send('No auth code received');

        const { userId } = JSON.parse(decodeURIComponent(state));

        const redirectURI = 'https://cybernauts.online/alpha16/zoho/connect';

        const tokenURL = `https://accounts.zoho.in/oauth/v2/token`;

        const params = new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            client_id: process.env.ZOHO_CLIENT_ID!,
            client_secret: process.env.ZOHO_CLIENT_SECRET!,
            redirect_uri: redirectURI,
        });

        const result = await axios.post(tokenURL, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const { access_token, refresh_token, expires_in } = result.data;

        // Convert expires_in (in seconds) to actual expiry date
        const expiry_date = new Date(Date.now() + expires_in * 1000).toISOString();

        const isSaved = await saveTokensInDB(userId, 'zoho', {
            access_token,
            refresh_token,
            expiry_date,
        });

        saveZohoMail(userId,access_token);

        if (!isSaved) {
            return res.status(400).send({ status: false, message: 'Could not save tokens. Try again' });
        }

        return res.redirect("http://localhost:3000/home?message='Zoho account connected'");
    } catch (err: any) {
        console.error('An error occurred while connecting to Zoho:', err.response?.data || err.message || err);
        return res.status(500).send({ status: false, message: 'Could not connect to Zoho. Try again later' });
    }
};



const getAllZohoMailAccounts=async(req:Request,res:Response) : Promise<any>=>{

    try{

        const {userId}=req.body;

        const accessToken=await getAccessToken(userId);

        if(!accessToken){

            return res.status(400).send({status:false,message:"Need to authenticate again."});
        }

        //getting all accounts
        const result=await axios.get('https://mail.zoho.com/api/accounts',{
            headers:{"Authorization" : `Zoho-oauthtoken ${accessToken}`}
        });

        const accounts=result.data.data;

        const accountData : Record<string,string>[]=[];
        accounts.forEach((account : any)=>{

            
            if(account.type==="ZOHO_ACCOUNT" || account.type==="IMAP_ACCOUNT"){

                accountData.push({

                    "accountId":account.accountId,
                    "name":account.accountDisplayName,
                    "email":account.primaryEmailAddress
               });
            }

        });


        if(accountData.length ==1){

            await saveEmail(userId,'zoho',accountData as unknown as string);
            return res.status(200).send({status:true,message:"Account data saved"});
        }


        return res.status(200).send({status:true,message:"Select one or more account",data:accountData});
    }catch(err){

        console.error("An error occured : ",err);
        return res.status(500).send({status:false,message:"Could not get accounts"});
    }
}

const saveZohoMail=async(userId : string,accessToken: string) : Promise<boolean>=>{

    try{

        const result=await axios.get('https://accounts.zoho.in/oauth/user/info',{
            headers:{"Authorization" : `Zoho-oauthtoken ${accessToken}`}
        });

        
        const email=result.data.Email;


        if (!email) {
            console.warn("No email returned from Zoho.");
            return false;
        }

        await saveEmail(userId, 'zoho', email);

        return true;


    }catch(err){

        console.error("An error occured : ",err);
        
        return false;
    }
}


export {getAuthURL,connectZoho,getAllZohoMailAccounts};
