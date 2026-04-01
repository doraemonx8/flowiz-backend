import { fetchAllPlaces, fetchPlaceDetails, getEmailFromWebsite,crawlEmails } from '../utils/leadUtil';
import {type Request,type Response} from 'express';
import { saveLeads,transferLeadsFromMaster,checkAudience } from '../models/leadModel';
import { getCampaignIdBySlug, saveKeywords } from '../models/campaignModel';

import QuotaEngine from '../utils/quotaEngine';

const getLeadsFromGoogle=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {query,slug,isNext}=req.query;
        const {userId,companyId,crawlDepth}=req.body;

        const campaigns = await getCampaignIdBySlug(slug as string, userId);
        console.log("CAMPAIGNS =>",campaigns)

        const campaignId = campaigns?.[0]?.id;

        if (!campaignId) {
           return res.status(401).send({status:false,message:"Not authorised to schedule this campaign"});
        }

        //saving crawled keywords in campaigns
        const keywordId=await saveKeywords(campaignId,query as string,userId);

        if(!keywordId){

            return res.status(500).send({status:false,message:"Unable to crawl.Try again later"});
        }


        //checking if already crawled
        const {audienceId,token}=await checkAudience(userId,keywordId as unknown as  string);

        if(audienceId && audienceId!==-1 && !isNext){
            return res.status(200).send({status:true,data:{audienceId,name:query}});
        }

        token ? crawlEmails(query as string,companyId,userId,crawlDepth,token as string) : crawlEmails(query as string,companyId,userId,crawlDepth);
        return res.status(200).send({status:true,keywordId});
    }catch(err){

        console.error("An error occured : ",err);
        return res.status(500).send({statu:false,message:"Could not get leads."});
    }
}


const getMasterLeadsFromGoogle=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {query,slug}=req.query;
        const {userId,companyId,crawlDepth}=req.body;

        const campaigns = await getCampaignIdBySlug(slug as string, userId);

        const campaignId = campaigns?.[0]?.id;

        if (!campaignId) {
           return res.status(401).send({status:false,message:"Not authorised to schedule this campaign"});
        }
  

        const {places} = await fetchAllPlaces(query as string,null ,250);
        

        const pendingUrls : Array<string>=[]; //urls for which emails could not be found
        let placeDetails : any = await Promise.all(
            places.map(async (place) => {
                const details = await fetchPlaceDetails(place.place_id);

                const websiteEmail= details.website ? await getEmailFromWebsite(details.website as string,crawlDepth) : "";

                if(!websiteEmail && details.website){
                    pendingUrls.push(details.website);
                }
                return {
                    phone: details.formatted_phone_number || "N/A",
                    website: details.website || "N/A",
                    email: websiteEmail
                };
            })
        );

        console.log("total pending urls =>",pendingUrls.length);

        //getting emails from crawler
        if(pendingUrls.length && crawlDepth > 1){

            try{

                const emailsResult =await fetch("https://ai.nextclm.in/cb/crawl-emails",{
                    method:"POST",
                    body:JSON.stringify({urls:pendingUrls})
                });

            if(!emailsResult.ok){

                //skip
                console.log("email result not ok");
            }


            const emails = await emailsResult.json() as Array<{[key: string]: string[]}>;

            console.log(emails);
            
            emails.forEach((emailData : any)=>{

                const url=Object.keys(emailData)[0];
                const urlEmails=emailData[url];

                placeDetails=placeDetails.map((place : any)=>{

                    if(place.website==url && urlEmails.length){
                        place.email =urlEmails[0];
                    }
                })

            })
            }catch(err : any){

                console.error(err.message);
            }
           
        };
        const quotaResult = await QuotaEngine.checkQuota(userId, "leads");
        if (placeDetails.length > quotaResult.remaining) {
            placeDetails = placeDetails.slice(0, quotaResult.remaining);
        }

        if (placeDetails.length === 0) {
            return res.status(400).send({ status: false, message: "No valid leads found or quota fully exhausted." });
        }

        //saving leads
        const audienceId=await saveLeads(placeDetails,companyId,query as string,userId);

        //saving crawled keywords in campaigns
        await saveKeywords(campaignId,query as string,userId);

        if(!audienceId){
            return res.status(500).send({status:false,message:"Could not save leads"});
        }

        await QuotaEngine.deductUsage({userId,featureSlug: 'leads',amount: placeDetails.length,source: 'consumption',description: `Crawled ${placeDetails.length} master leads for query: ${query}`});
        
        return res.status(200).send({status:true,message :`Leads crawled & saved for audience : ${query}`,audienceId});
    }catch(err){

        console.error("An error occured : ",err);
        return res.status(500).send({statu:false,message:"Could not get leads."});
    }
}

const transferMasterAudience=async(req:Request,res:Response):Promise<any>=>{


    try{

        const {userId,companyId}=req.body;

        const {audienceId,name}=await transferLeadsFromMaster(userId,companyId);

        if(!name || ! audienceId){
            return res.status(500).send({status:false,message:"Could not transfer leads"});
        }

        return res.status(200).send({status:true,message:"Leads transferred done",name,audienceId});
    }catch(err){
         console.error("An error occured while transferring leads : ",err);
        return res.status(500).send({status:false,message:"Could not transfer audience. Try again later"});
       
    }
}


const checkForAudience=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId,keywordId}=req.body;


        const {audienceId,audienceName}=await checkAudience(userId,keywordId) || {};

        if(audienceId){

            return res.status(200).send({status:true,data:{audienceId,name:audienceName}});
        }

        return res.status(400).send({status:false,message:"crawling pending"});

    }catch(err){

        console.error(err);
        return res.status(500).send({status:false,message:"Some error occured while checking for audience"});
    }
}
export {getLeadsFromGoogle,transferMasterAudience,getMasterLeadsFromGoogle,checkForAudience};