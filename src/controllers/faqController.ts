import {type Request,type Response} from 'express';

import { PineconeStore } from '@langchain/pinecone';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

import { pinecone,embeddings } from '../config/pinecone';

import {getFlowIdBySlug} from "../models/flowModel";
import {getFAQ,getFaqById,deleteFAQById,updateFAQById,InsertFAQ,deleteFAQDoc} from "../models/faqModel";
import pdf from 'pdf-parse';
import fs from "fs/promises";

import QuotaEngine from '../utils/quotaEngine';

const addFAQByDoc=async (req : Request, res : Response):Promise<any>=>{
    try {
        const fileName=req.file?.filename;
        const {userId,slug,subscriptionId}=req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        // Check if the file is a PDF
        if (req.file.mimetype !== 'application/pdf') {
            return res.status(400).json({ error: 'File is not a PDF' });
        }

        if(!slug){
            return res.status(400).send({status:false,message:"Flow slug required"});
        }

        const flowId=await getFlowIdBySlug(slug,userId);

        // Use pdf-parse to extract text from the PDF buffer
     
        const fileBuffer = await fs.readFile(req.file.path);
        const data = await pdf(fileBuffer);


        if(data.text.length > 10000){
            return res.status(400).send({status:false,message:"File text too large. Pls try with smaller files"});
        }
        
        const kbSize = Math.max(1, Math.ceil(data.text.length / 1024));

        const doc = [{ pageContent: data.text, metadata: { flowId,fileName } }];

        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 100,
        });

        const chunkedText = await textSplitter.splitDocuments(doc);



        const index = pinecone.Index('flowiz');

      const pinecone_res=await PineconeStore.fromDocuments(chunkedText, embeddings, {
        pineconeIndex: index,
        namespace: userId.toString(),
        textKey: 'text',
      });

      console.log("res =>",pinecone_res);

      //saving in flow
      await InsertFAQ(userId,flowId as string,fileName as string,fileName as string,data.text,true);
      await QuotaEngine.deductUsage({userId,featureSlug: 'kb_file_length',amount: kbSize,source: 'consumption',description: `Added FAQ Doc: ${fileName} (${kbSize} KB)`});
        res.json({ name: req.file.filename,text:data.text, message:'doc added successfully' });
    } catch (err) {
        console.error(err); // Log the error for debugging
        res.status(500).json({ error: 'An error occurred while processing the document' });
    }
}


const deleteFAQByDoc = async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, slug, fileName } = req.body;

    if (!userId || !slug || !fileName) {
      return res.status(400).json({ error: "userId, slug, and fileName are required" });
    }

    // get flowId from your helper
    const flowId = await getFlowIdBySlug(slug, userId);
    if (!flowId) {
      return res.status(404).json({ error: "Flow not found" });
    }

    const index = pinecone.Index("flowiz");

    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace: userId.toString(),
      textKey: "text",
    });

    // delete vectors matching metadata
    await vectorStore.delete({
      filter: { flowId, fileName }
    });

    // removing from campaign
    await deleteFAQDoc(userId,flowId as string,fileName);

    return res.json({ message: "Document vectors deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "An error occurred while deleting document vectors" });
  }
};



// **FAQ**

const addFaq=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId,faqArray,subscriptionId}=req.body;

        let flowId : string | any;
        let count = 0;

        for (const faq of faqArray){

            if(faq.slug){ //add

                if(!flowId){
                    flowId=await getFlowIdBySlug(faq.slug,userId);

                    if(!flowId){
                        return res.status(400).send({status:false,message:"Invalid slug provided"});
                    }
                }


                const faqString = `Q- ${faq.question}\n A- ${faq.answer}`;

                const index = pinecone.Index('flowiz');

                // Generate a unique ID for this FAQ
                const faqId = `faq_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                
                const embedding = await embeddings.embedQuery(faqString);

                // Upsert the new FAQ into the existing namespace
                await index.namespace(userId.toString()).upsert([
                {
                id: faqId,
                values: embedding,
                metadata: {
                    text: faqString,
                    type: 'faq',
                    flowId:flowId as string
                }
                }
            ]);

            await InsertFAQ(userId,flowId as string,faqId,faq.question,faq.answer);


            }

            if(faq.faqId){ //update

                //getting vector Id
                const FAQ : any= await getFaqById(userId,faq.faqId);

                if(!FAQ){

                    return res.status(401).send({status:false,message:"NO FAQ found"});
                }

                const faqString = `Q- ${faq.question}\n A- ${faq.answer}`;

                const vectorId=FAQ[0]?.vectorId;
                const flowId=FAQ[0]?.flowId;

                const index = pinecone.Index('flowiz');

                const embedding = await embeddings.embedQuery(faqString);
                await index.namespace(userId.toString()).update({
                    id:vectorId,
                    values:embedding,
                    metadata:{
                        text: faqString,
                        type:'faq',
                        flowId:flowId as string
                    }
                });

                await updateFAQById(userId,faq.faqId,faq.question,faq.answer);
            }
            count++;
        }
    
        await QuotaEngine.deductUsage({userId,featureSlug: 'kb_faq',amount: count,source: 'consumption',description: `Added manual FAQs (${count})`});
    
      return res.status(200).send({status:true,message:"FAQ's added/updated"});

    }catch(err){

        console.error(err);
        return res.status(500).send({status:false,message:"Could not save FAQ"});
    }
}


const getAllFaq=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId}=req.body;

        const {slug}=req.query;

        const flowId=await getFlowIdBySlug(slug as string,userId);

        const data=await getFAQ(userId,flowId as string);

        return res.status(200).send({status:true,data});

    }catch(err){
        console.error("An error occured while getting FAQ : ",err);
        return res.status(500).send({status:false,message:"Could not get FAQ's"});

    }
}


const deleteFAQ=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {userId}=req.body;
        const {faqId}=req.query;


        //checking FAQ
        const FAQ : any=await getFaqById(userId,faqId as string);

        if(!FAQ){
            return res.status(401).send({status:false,message:"No FAQ found"});
        }

        const vectorId=FAQ[0].vectorId;

        const index=pinecone.Index("flowiz");

        await index.namespace(userId.toString()).deleteOne(vectorId);

        await deleteFAQById(faqId as string,userId);

        return res.status(200).send({status:true,message:"FAQ deleted"});


    }catch(err){
        console.error("Deleting FAQ : ",err);
        return res.status(500).send({status:false,message:"Could not delete FAQ"});
    }
}



export {addFAQByDoc,addFaq,getAllFaq,deleteFAQ,deleteFAQByDoc}

