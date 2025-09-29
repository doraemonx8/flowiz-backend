import { checkCrawl } from "../models/authorizationModel";
import {Request,Response,NextFunction} from "express";


const checkCrawlerLevel=async(req:Request,res:Response,next:NextFunction):Promise<any>=>{


    try{

        const {userId}=req.body;

        const crawlDepth=await checkCrawl(userId);

        if(crawlDepth === -1){
            return res.status(400).send({status : false,message:"Subscribe to a plan."});

        }

        req.body.crawlDepth=crawlDepth;
        return next();
    }catch(err){
        console.error(err);
        return res.status(500).send({status:false,message:"Unable to check crawl level."});
    }
}


export default checkCrawlerLevel;