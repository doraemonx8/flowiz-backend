import db from "../models/conn";
import { QueryTypes } from "sequelize";



const checkCampaignCount=async(userId:string)=>{


    try{

        const data : {remainingCampaigns:number,usedCampaigns:number,subscriptionId:number}[]=await db.sequelize.query(`SELECT 
                        p.campaigns - COUNT(l.id) AS remainingCampaigns,
                        COUNT(l.id) AS usedCampaigns,
                        s.id as subscriptionId
                    FROM subscriptions s
                    INNER JOIN plans p ON p.id = s.planId
                    LEFT JOIN ledger l 
                        ON l.subscriptionId = s.id 
                    AND l.userId =:userId
                    AND l.type = 'campaign'
                    AND l.isDeposit='0'
                    WHERE s.userId =:userId
                    AND s.isDeleted = '0'
                    AND s.isCancelled = '0'
                    AND (s.createdOn + INTERVAL p.duration MONTH) > CURRENT_TIMESTAMP
                    GROUP BY s.id, p.campaigns;
                `,{
                    replacements:{userId},type:QueryTypes.SELECT
                });

        if(data.length && 'remainingCampaigns' in data[0] && data[0].remainingCampaigns>0){
            return {isAllowed:true,subscriptionId:data[0].subscriptionId};
        }

        return false;
    }catch(err){
        console.error(err);
        return false;
    }
}


const checkLeadCount=async(userId:string)=>{

    try{

        const data : {remainingLeads:number,usedLeads:number}[]=await db.sequelize.query(`
            SELECT p.leads - COUNT(l.id) as remainingLeads,COUNT(l.id) as usedLeads
            FROM subscriptions s
            INNER JOIN plans p on p.id=s.planId
            LEFT JOIN ledger l
            ON l.subscriptionId=s.id
            AND l.userId=:userId
            AND l.type='lead'
            AND l.isDeposit='0'
            WHERE s.userId=:userId
            AND s.isDeleted='0'
            AND s.isCancelled='0'
            AND (s.createdOn + INTERVAL p.duration MONTH) > CURRENT_TIMESTAMP
            GROUP BY s.id,p.leads`,{
                replacements:{userId},
                type:QueryTypes.SELECT
            });


        if (data.length && "remainingLeads" in data[0] && data[0].remainingLeads>0){
            return true;
        }

        return false;
    }catch(err){

        console.error(err);
        return false;
    }
}

const checkCrawlLeadCount=async(userId:string)=>{
    try{

        const data : {remainingCrawlLeads:number,usedCrawlLeads:number}[]=await db.sequelize.query(`
            SELECT p.crawlLeads - COUNT(l.id) as remainingCrawlLeads,COUNT(l.id) as usedCrawlLeads
            FROM subscriptions s
            INNER JOIN plans p on p.id=s.planId
            LEFT JOIN ledger l on l.subscriptionId=s.id
            AND l.userId=:userId AND l.type='crawledAudience' 
            AND l.isDeposit='0'
            WHERE s.userId=:userId AND s.isDeleted='0'
            AND s.isCancelled='0' AND (s.createdOn + INTERVAL p.duration MONTH) > CURRENT_TIMESTAMP
            GROUP BY s.id,p.crawlLeads`,{
                replacements:{userId},
                type:QueryTypes.SELECT
            });


        if(data.length && "remainingCrawlLeads" in data[0] && data[0].remainingCrawlLeads>0){
            return true;
        }

        return false;
    }catch(err){
        console.error(err);
        return false;

    }
}


const checkFaqCount=async(userId:string)=>{
    try{
        const data : {remainingFaq:number,usedFaq:number,subscriptionId:number}[]=await db.sequelize.query(`
            SELECT p.faq - COUNT(l.id) as remainingFaq,COUNT(l.id) as usedFaq,s.id as subscriptionId
            FROM subscriptions s
            INNER JOIN plans p on p.id=s.planId
            LEFT JOIN ledger l on l.subscriptionId=s.id
            AND l.userId=:userId AND l.type='faq'
            AND l.isDeposit='0'
            WHERE s.userId=:userId AND s.isDeleted='0'
            AND s.isCancelled='0' AND (s.createdOn + INTERVAL p.duration MONTH) > CURRENT_TIMESTAMP
            GROUP BY s.id,p.faq`,{
                replacements:{userId},
                type:QueryTypes.SELECT
            });

        if(data.length && 'remainingFaq' in data[0] && data[0].remainingFaq>0){
            return {isAllowed:true,subscriptionId:data[0].subscriptionId};
        }
        return false;
    }catch(err){
        console.error(err);
        return false;
    }
}


const checkEmailCount=async(userId:string)=>{
    try{
        const data : {remainingEmailAccounts : number,usedEmailAccounts : number , subscriptionId:number}[]=await db.sequelize.query(`
            SELECT p.emailAccounts - COUNT(l.id) as remainingEmailAccounts,COUNT(l.id) as usedEmailAccount,s.id as subscriptionId
            FROM subscriptions s
            INNER JOIN plans p on p.id=s.planId
            LEFT JOIN ledger l on l.subscriptionId=s.id
            AND l.userId=:userId AND l.type='emailAccount'
            AND l.isDeposit='0'
            WHERE s.userId=:userId AND s.isDeleted='0'
            AND s.isCancelled='0' AND (s.createdOn + INTERVAL p.duration MONTH) > CURRENT_TIMESTAMP
            GROUP BY s.id,p.emailAccounts
            `,{
                replacements:{userId},
                type:QueryTypes.SELECT
            });


            if(data.length && "remainingEmailAccounts" in data[0] && data[0].remainingEmailAccounts > 0){
                return {isAllowed : true,subscriptionId:data[0].subscriptionId}
            }

            return false;
    }catch(err){
        console.error(err);
        return false;
    }
}


const checkCrawl=async(userId:string)=>{

    try{

        const data=await db.sequelize.query(`
            SELECT p.crawlDepth FROM subscriptions s INNER JOIN plans p on p.id=s.planId WHERE s.userId=:userId AND s.isDeleted='0' AND s.isCancelled='0'
            AND (s.createdOn + INTERVAL p.duration MONTH) > CURRENT_TIMESTAMP`,{
                replacements:{userId},
                type:QueryTypes.SELECT
            });

        if(data.length && 'crawlDepth' in data[0]){
            return data[0].crawlDepth;
        }

        return -1;
    }catch(err){
        console.error(err);
        return -1;
    }
}


const checkMessageLimit=async(userId:string,type:string)=>{

    try{

        const data : {remainingMessage:number,subscriptionId:number}[]=await db.sequelize.query(`
            SElECT p.${type}-COUNT(l.id) as remainingMessage,COUNT(l.id) as usedMessage,s.id as subscriptionId FROM subscriptions s 
            INNER JOIN plans p on p.id=s.planId
            LEFT JOIN ledger l on l.subscriptionId=s.id AND l.userId=:userId 
            WHERE s.userId=:userId AND s.isDeleted='0'
            AND l.isDeposit='0'
            AND s.isCancelled='0' AND (s.createdOn + INTERVAL p.duration MONTH) > CURRENT_TIMESTAMP `,{
                replacements:{userId},
                type:QueryTypes.SELECT
            });

            if(data.length && "remainingMessage" in data[0] && "subscriptionId" in data[0] && data[0].remainingMessage > 0){
                return {isAllowed:true,subscriptionId:data[0].subscriptionId};
            }

            return false;
    }catch(err){
        console.error(err);
        return false;
    }
}

export {checkCampaignCount,checkLeadCount,checkCrawlLeadCount,checkFaqCount,checkEmailCount,checkCrawl,checkMessageLimit};