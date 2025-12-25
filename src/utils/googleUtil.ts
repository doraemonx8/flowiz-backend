import {OAuth2Client} from "google-auth-library";
import keys from "../third-party/client_secret";

import { google } from 'googleapis';

import {saveTokensInDB,getTokensFromDB} from "../models/userModel";
import { saveEmail,isEmailChatPresent, addMailMessage } from "../models/emailModel";
import { sendMessageToAgent } from "./eventManager";


const refreshAccessToken = async (userId: string, refreshToken: string): Promise<any> => {
    try {
        const authClient = new OAuth2Client({
            clientId: keys.web.client_id,
            clientSecret: keys.web.client_secret,
            redirectUri: "https://cybernauts.online/alpha16"
        });

        // Set the refresh token
        authClient.setCredentials({
            refresh_token: refreshToken
        });

        // Refresh the access token
        const { credentials } = await authClient.refreshAccessToken();


        const tokenData = {
            access_token: credentials.access_token!,
            refresh_token: credentials.refresh_token || refreshToken,
            expiry_date: credentials.expiry_date as number,
        };

        // Save updated tokens to database
        const isSaved = await saveTokensInDB(userId,'google',tokenData);
        
        if (!isSaved) {
            return {
                status: false,
                error: "Failed to save refreshed tokens to database"
            };
        }

        return {
            status: true,
            tokens: tokenData
        };

    } catch (error: any) {
        console.error("Error refreshing access token:", error);
        
        if (error.code === 'invalid_grant') {
            return {
                status: false,
                error: "Refresh token is invalid or expired. User needs to re-authenticate."
            };
        }

        return {
            status: false,
            error: "Failed to refresh access token"
        };
    }
};


const getValidAccessToken = async (userId: string): Promise<string | null> => {
    try {
        // Get stored tokens from database
        const storedTokens = await getTokensFromDB(userId,'google');

        if (!storedTokens) {
            console.log("No stored tokens found for user");
            return null;
        }

        // Check if access token is still valid (with 5 minute buffer)
        const now = Date.now();
        const expiryTime = storedTokens.expiryDate || 0;
        const bufferTime = 5 * 60 * 1000; 

        if (expiryTime > now + bufferTime) {

            return storedTokens.accessToken;
        }

        console.log("Access token expired, refreshing...");
        
        if (!storedTokens.refreshToken) {
            console.log("No refresh token available");
            return null;
        }

        const refreshResult = await refreshAccessToken(userId, storedTokens.refreshToken);
        

        if (refreshResult.status && refreshResult.tokens) {
            return refreshResult.tokens.access_token;
        }

        console.error("Failed to refresh token:", refreshResult.error);
        return null;

    } catch (error) {
        console.error("Error getting valid access token:", error);
        return null;
    }
};


const ensureValidToken = async (userId: string): Promise<OAuth2Client | null> => {
    try {
        const validAccessToken = await getValidAccessToken(userId);
        
        if (!validAccessToken) {
            return null;
        }

        // Create OAuth2Client with valid token
        const authClient = new OAuth2Client({
            clientId: keys.web.client_id,
            clientSecret: keys.web.client_secret,
            redirectUri: "https://cybernauts.online/alpha16/google/connect"
        });

        const storedTokens = await getTokensFromDB(userId,'google');
        authClient.setCredentials({
            access_token: validAccessToken,
            refresh_token: storedTokens?.refreshToken
        });

        return authClient;

    } catch (error) {
        console.error("Error ensuring valid token:", error);
        return null;
    }
};


interface EmailOptions {
  to: string;
  from: string;
  subject: string;
  body: string;
  signature ?: string;
  isHtml?: boolean; // Optional flag for HTML emails
}




const sendGmailEmail = async (userId: string, emailOptions: EmailOptions): Promise<any> => {
  try {
    
    const authClient = await ensureValidToken(userId);
    
    if (!authClient) {
      return {
        status: false,
        error: "Unable to get valid access token. User needs to re-authenticate."
      };
    }

    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Create email message in RFC 2822 format
    const emailLines = [
      `To: ${emailOptions.to}`,
      `From: ${emailOptions.from}`,
      `Subject: ${emailOptions.subject}`,
    ];

    if (emailOptions.isHtml) {
      emailLines.push('Content-Type: text/html; charset=utf-8');
    }

    emailLines.push(''); // Empty line separates headers from body
    emailLines.push(emailOptions.body + "\n" + emailOptions.signature);

    const email = emailLines.join('\n');

    // Encode the email in base64url format
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
      },
    });

    console.log(`Email sent successfully. Message Id: ${response.data.id}`);
    
    return {
      status: true,
      messageId: response.data.id,
      threadId:response.data.threadId
    };

  } catch (error: any) {
    console.error('Error sending email:', error);
    
    return {
      status: false,
      error: error.message || 'Failed to send email'
    };
  }
};


const sendGmailReply=async(userId:string,emailOptions:any):Promise<any>=>{

  try{

     const authClient = await ensureValidToken(userId);
    
    if (!authClient) {
      return {
        status: false,
        error: "Unable to get valid access token. User needs to re-authenticate."
      };
    }

    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const emailLines=[];

    emailLines.push(`From: ${emailOptions.from}`);
    emailLines.push(`To: ${emailOptions.to}`);
    emailLines.push(`Subject: ${emailOptions.subject}`);
    emailLines.push(`MIME-Version: 1.0`);
    emailLines.push(`Content-Type: text/html; charset="UTF-8"`); 
    emailLines.push(`Content-Transfer-Encoding: base64`);
    emailLines.push(`In-Reply-To: <${emailOptions.lastMessageId || ''}>`);
    const referencesString = emailOptions.references.map((id : string)  => `<${id}>`).join(' ');
    emailLines.push(`References: ${referencesString}`);

    // Add an empty line to separate headers from body
    emailLines.push('');

    // Encode the body content
    const encodedBody = Buffer.from(emailOptions.body).toString('base64');
    emailLines.push(encodedBody);

    const rawEmail = emailLines.join('\n');
    const rawMessage=Buffer.from(rawEmail).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // Remove padding characters

    console.log(rawMessage);
    console.log("-------------------");
    const response = await gmail.users.messages.send({
            userId: "me", 
            requestBody: {
                raw: rawMessage,
                threadId: emailOptions.threadId, 
            },
        });

        return response.data.id;

  }catch(err){

    console.error("An error occured while replying in Gmail : ",err)
    return false;
  }
}





const saveGoogleMail = async (userId:string,access_token: string): Promise<boolean> => {
  try {
    const authClient = new google.auth.OAuth2(
      keys.web.client_id,
      keys.web.client_secret,
      "https://cybernauts.online/alpha16/google/connect"
    );

    authClient.setCredentials({ access_token });

    const oauth2 = google.oauth2({auth: authClient,version: 'v2'});

    const { data } = await oauth2.userinfo.get();


    //saving
    await saveEmail(userId,'google',data.email as string);

    return true;
  } catch (err) {
    console.error("An error occurred while saving Google email =>", err);
    return false;
  }
};


const setupGmailWatch = async (access_token: string) => {
  if (!access_token) {
    console.error("Access token is missing.");
    return false;
  }

  try {
    const authClient = new google.auth.OAuth2(
      keys.web.client_id,
      keys.web.client_secret,
      "https://cybernauts.online/alpha16/google/connect"
    );

    authClient.setCredentials({ access_token });

    const gmail = google.gmail({ version: "v1", auth: authClient });

    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: "projects/msgapp-5ad6e/topics/gmail-reply"
      }
    });
    
    return response.data;

  } catch (err) {
    console.error("An error occurred in Gmail watch:", err);
    return false;
  }
};



const getMailContent=async(messageId:string,email:string,authClient:OAuth2Client)=>{

  try{

 
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    const messageRes = await gmail.users.messages.get({
        userId: email,
        id: messageId,
        format: 'full', // 'full' format is necessary to get headers and body
    });

    const fullMessage = messageRes.data;


    let subject = '';
    const headers = fullMessage.payload?.headers;
    const subjectHeader = headers?.find(header => header.name === 'Subject');
    if (subjectHeader) {
        subject = subjectHeader.value as string;
    }



    let bodyContent = '';
    const parts = fullMessage.payload?.parts;

    if (parts) {

        for (const part of parts) {
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                bodyContent = Buffer.from(part.body.data, 'base64').toString('utf8');
                break; 
            }
        }
    } else if (fullMessage.payload?.body && fullMessage.payload.body.data) {
        bodyContent = Buffer.from(fullMessage.payload.body.data, 'base64').toString('utf8');
    }


    return {
      subject,
      body:bodyContent
    }


  }catch(err){
    console.error("An error occured while getting mail content : ,",err);
    return null;
  }
}
// const getGmailMessage=async(userId:string,email:string,historyId:string,companyId:string):Promise<any>=>{

//   try{

//      const authClient = await ensureValidToken(userId);
    
//     if (!authClient) {
//       return {
//         status: false,
//         error: "Unable to get valid access token. User needs to re-authenticate."
//       };
//     }

//     const gmail = google.gmail({ version: 'v1', auth: authClient });

//     console.log(`Fetching history for user: ${userId} starting from historyId: ${historyId}`);

//     const historyRes = await gmail.users.history.list({
//           userId: email,
//           startHistoryId: historyId,
//           historyTypes: ['messageAdded']
//     });

//     const history = historyRes.data.history || [];

//     if(!history.length){

//       console.log("No history data");
//       return false;
//     }
//     const messagesAdded : any=history.map((obj)=> obj.messagesAdded);

//     if(!messagesAdded.length){
//       console.log("No messages added!!");
//       return false;
//     }

//     //getting threadId
//     const threadId = messagesAdded[0][0].message.threadId;
//     const messageId=messagesAdded[0][0].message.id;

//     //checking if email chat present
//     const isEmailChat=await isEmailChatPresent(threadId,userId);

//     if(!isEmailChat){

//       console.log("No email chat found for current mail")
//       return null;
//     }


//     //getting mail and its content
//     const mail : any= await getMailContent(messageId,email,authClient);

//     if(!mail){
//       return null;
//     }


//     const {subject,body}=mail;

//     console.log(mail);

//     //appending in chat
//     const chatId=await addMailMessage(threadId,userId,subject,body,messageId);

//     //message event
//     sendMessageToAgent(companyId,{type:"messageAdded",message:{userId,message:body,createdOn:new Date().getTime(),isBot:false,isSeen:false},chatId})
//     return true;

//   }catch(err){
//     console.error("An error occured while getting latest google mail : ",err);
//     return null;
//   }
// }

const getGmailMessage=async(userId:string,email:string,historyId:string,companyId:string)=>{

  return true;
}


export { refreshAccessToken, getValidAccessToken, ensureValidToken, sendGmailEmail, saveGoogleMail, setupGmailWatch, getGmailMessage,sendGmailReply };
