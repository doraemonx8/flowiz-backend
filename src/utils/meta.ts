import axios from "axios";
import { getWABAIDAndToken } from "../models/templateModel";

const PUBLIC_MEDIA_BASE_URL = "https://cybernauts.one/server-panel-ts/uploads/"; // add this to fileName

const metaTypeToMediaHandleMap={
  "image": "4::aW1hZ2UvcG5n:ARaB_RtVAkwWEiKTjaEFQIppS1JIidQdxGdRB9Vyg-WhdckkyY0tB0f8BWSSJf1THGERH2Mo-f-lw3Uqt5W0-SYG-F7L911DKPv0wijqSOTqfw:e:1763734357:1140075601094888:100001687350501:ARZ76f04Q8V9Di9rsGI",
  "document": "4:dGVtcGxhdGVfZG9jdW1lbnQ=:YXBwbGljYXRpb24vcGRm:ARZy4IOR2TbRGN9RD2q3V5pFmgl4LVsK9x0cRDxPvigb5xEq7jrp0gObgx7eeVoCcYrvrkolWYGStpbGBqJ7j03b4RFYR0973vUk3GHfIPv-Uw:e:1751029017:1140075601094888:100001687350501:ARaiBz-Pbq_vQWot0DQ",
  "video": "4:dGVtcGxhdGVfdmlkZW8=:dmlkZW8vbXA0:ARZ9MxXQl9ApugddCPC_xCtAzZM82PiquYncfPpo2pYs_8ovZRLPjviTmAutLY_e1qHzZAUshJnyOzPZ86opaq9nRp_NesWhJ2fx5h0PQ_LjMg:e:1751029123:1140075601094888:100001687350501:ARZtW3RfosyUobaTDBs\n4:dGVtcGxhdGVfdmlkZW8=:dmlkZW8vbXA0:ARYSUw9nwwDh6_9xS9fnMpxsiYaJe5h6Yh2Ruvyt3yXgOfAaLQRHDQ5OHISs0CXQtmbFFWTQF-kfjFXOcX3uZMLv5XmryR8wMhHAHr49eQD4LA:e:1751029123:1140075601094888:100001687350501:ARYVunnj2AsbXL9mznk\n4:dGVtcGxhdGVfdmlkZW8=:dmlkZW8vbXA0:ARbBj7ICBMNPi3mjolPJaqBtXDlwMoZJXd3QzQGgRhMPkTDTg7v-5cG-wBKjAxI3-FxqnIa4q80x5kiXSW5xU_WmzcqPBV0zI5Th98dr5WhTDg:e:1751029123:1140075601094888:100001687350501:ARZEnWM3Y6IsYzFSk94\n4:dGVtcGxhdGVfdmlkZW8=:dmlkZW8vbXA0:ARbIORDL5DDBzpt_GolVYP5rgY8zeg9QLrlUmtnBpLmrJmGeyqBlduf1QqFa_HUVHQjdnMrAHJtwmbpXjU5FH94dMSr5wlLvHgNMCzZQAEZ63Q:e:1751029123:1140075601094888:100001687350501:ARYT8ru2AHVtT5Lv7Ok\n4:dGVtcGxhdGVfdmlkZW8=:dmlkZW8vbXA0:ARZnEgSFkNnRENDvC9TIUMVQ_rwATo97XUACZ3uKV0mS4X33aumZXZQAlbLVBvyC6irolRmV6bohv9exdJuLEGfomvN76y74zk02sVtf6DtWmQ:e:1751029123:1140075601094888:100001687350501:ARb1LqKyymPslFUqLqc\n4:dGVtcGxhdGVfdmlkZW8=:dmlkZW8vbXA0:ARa2PULTdNYilvfjBpBp1o6pgV5g6EiluUEPOWsFb42bTJR6kXNuEFt5Zprp-2GU2LWpcmfdGK9NiTqYh9mk7T6q4HzRV3YxNT-snJ9cXZn5OQ:e:1751029123:1140075601094888:100001687350501:ARZKVG-zBCBerVy0U2k"
}


const getTemplatesFromMeta=async(wabaID:string,token:string)=>{
    try{
        const response = await axios.get(
            `https://graph.facebook.com/${process.env.META_API_VERSION}/${wabaID}/message_templates?fields=name,status,id`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );
          if (response && response.status === 200) {
            return {status:true,data:response.data?.data || [],message:"templates fetched"};
          } else {
            console.error("Invalid response:", response.status, response.statusText);
            return {status:false,message:response.statusText,data : []};
          }

    }catch(err : any){
        console.error("An error occured while getting templates from meta : ",err);
        return {status:false,message:err.message,data:[]};
    }
}


const sendTemplateToMeta=async(wabaId:string,data:any,token:string)=>{
    try{
          //checking for header type
          const parsedData = typeof data === "string" ? JSON.parse(data) : data;
  
          const format = parsedData.components[0]?.format;
          if (format && format !== "TEXT") {
            const handle = format === "IMAGE" ? metaTypeToMediaHandleMap.image
                : format === "VIDEO" ? metaTypeToMediaHandleMap.video
                : metaTypeToMediaHandleMap.document;

            parsedData.components[0].example = { header_handle: [handle] };
          }
    
           // Send request to Meta API to post the template
           const response = await axios.post(
            `https://graph.facebook.com/v23.0/${wabaId}/message_templates`,
            parsedData, 
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
           if (response && response.status === 200) {
            console.log("Valid response:", response.data);
            return {status:true,data:response.data};
          } else {
            console.error("Invalid response:", response.status, response.statusText);
            return {status:false,message:response.statusText};
          }
    }catch(err : any){
        console.error("An error occured while sending template to meta : ",err.response.data);
        return {status:false,message:err.message};
    }
}


const sendOrUpdateTemplateToMeta = async (wabaId: string, data: any, token: string,templateId?: string) => {
  try {
    // Parse data if string
    const parsedData = typeof data === "string" ? JSON.parse(data) : data;

    // Handle HEADER media type (IMAGE / VIDEO / DOCUMENT)
    const format = parsedData.components?.[0]?.format;
    if (format && format !== "TEXT") {
      const handle =
        format === "IMAGE"
          ? metaTypeToMediaHandleMap.image
          : format === "VIDEO"
          ? metaTypeToMediaHandleMap.video
          : metaTypeToMediaHandleMap.document;

      parsedData.components[0].example = { header_handle: [handle] };
    }

    // Determine URL → create or update
    const url = templateId
      ? `https://graph.facebook.com/v23.0/${templateId}`                 // UPDATE
      : `https://graph.facebook.com/v23.0/${wabaId}/message_templates`; // CREATE

    // Make API call
    const response = await axios.post(url, parsedData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response?.status === 200) {
      console.log(templateId ? "Template updated:" : "Template created:", response.data);
      return { status: true, data: response.data };
    } else {
      console.error("Invalid response:", response.status, response.statusText);
      return { status: false, message: response.statusText };
    }
  } catch (err: any) {
    console.error(
      "Meta Template API Error:",
      err.response?.data || err.message
    );
    return { status: false, message: err.message };
  }
};



const sendTemplateMessageFromMeta=async(userId:string,phone:string,templateData:any)=>{
  try{
    //get token data
    console.log("Template Data:",templateData);
    const {token,phoneNumberId}=await getWABAIDAndToken(userId) || {};
      const components=[];
      if(templateData?.templateFile){
        //media template
        components.push({
          type:"header",
          parameters:[
            {
              type:"image",
              image:{link:`${PUBLIC_MEDIA_BASE_URL}${templateData.templateFile}`}
            }
          ]
        })
      }

      //text based parameters
      if(templateData?.templateParams){
        Object.keys(templateData.templateParams).forEach((paramType:string)=>{
          components.push({
            type:paramType,
            parameters:templateData.templateParams[paramType]
        })
        })
      }

      const response = await axios.post(
        `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
        {
          "messaging_product":"whatsapp",
          "to":phone,
          "type":"template",
          "template":{
            "name":`${templateData.template}`,
            "language":{"code":`${templateData.language || "en_US"}`},
            "components":components
         }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log("response from meta =>",response.data);

      if (response && response.status === 200) {
        console.log("Valid response:", response.data);
        return {status:true,data:response.data};
      } else {
        console.error("Invalid response:", response.status, response.statusText);
        return {status:false,message:response.statusText};
      }
    
  }catch(err:any){

    console.error("An error occured while sending template message from meta : ",err.response.data);
    return {status:false,message:err.response.data};
  }
}


const sendMessageFromMeta=async(userId:string,phone:string,message:string) : Promise<boolean>=>{
  try{
    const {phoneNumberId,token}=await getWABAIDAndToken(userId) || {};

    if(!phoneNumberId || !token){
      return false;
    }

    const res=await axios.post(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        "messaging_product":"whatsapp",
        "to":phone,
        "type":"text",
        "text":{
          "preview_url":false,
          "body":message
        }
      }
      ,{
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      }
    });

    console.log("response from meta =>",res.data);

    return true;
  }catch(err){
    console.error("Error in sending meta message : ",err);
    return false;
  }
}


const subscribeWebhook=async(wabaId:string,token:string)=>{
  try{

    const res=await axios.post(`https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`,{},{
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      }
    });

    console.log(res.data);
    return true;
  }catch(err){

    console.error(err);
    return false;
  }
}

const registerPhone=async(phoneNumberId:string,token:string)=>{
  try{
    const res=await axios.post(`https://graph.facebook.com/v18.0/${phoneNumberId}/register`,{
      "messaging_product":"whatsapp",
      "pin":424242
    },{
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      }
    });

    console.log(res.data);
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}
const disconnect=async(wabaId:string,token:string,phoneNumberId:string)=>{
  try{
    //de-register phone number Id
    const res1=await axios.post(`https://graph.facebook.com/v23.0/${phoneNumberId}/deregister`,{},{
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      }
    });

    console.log(res1.data);


    //delete webhook
    const res2=await axios.delete(`https://graph.facebook.com/v23.0/${wabaId}/subscribed_apps`,{
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      }
    });

    console.log(res2.data);

    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}



export {getTemplatesFromMeta,sendOrUpdateTemplateToMeta,sendTemplateMessageFromMeta,sendMessageFromMeta,subscribeWebhook,registerPhone,disconnect};
