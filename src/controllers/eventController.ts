
import {Request,Response} from 'express';

import {addClient,removeClient,sendMessageToAgent,addWebClient,removeWebClient,sendMessageToWebUser} from "../utils/eventManager";

import getTokenData from "../middleware/decodeToken";

import { decryptId } from '../utils/encryptDecrypt';

const chatEvent = async (req: Request, res: Response): Promise<void> => {
    try {

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write('retry: 5000\n\n');
        res.flushHeaders(); // Ensures headers are sent before anything else

        const userId = req.query.userId as string;
        const token = req.query.token as string;

        if (!userId || !token) {
            res.write(`data:${JSON.stringify({ type: "Invalid parameter" })}\n\n`);
            res.end();
            return;
        }

        const decodedToken = getTokenData(token);

        if (!decodedToken.status) {
            res.write(`data:${JSON.stringify({ type: decodedToken.message })}\n\n`);
            res.end();
            return;
        }

        const companyId = decodedToken.companyId;
        console.log("New event subscriber:", userId, companyId);

        // Add client to list
        addClient(userId, companyId, res);
        console.log("Client added");

        // Initial connected message
        res.write(`data:${JSON.stringify({ type: "connected" })}\n\n`);

        const heartbeatInterval = setInterval(() => {
            res.write('event: ping\n'); // Use a named event 'ping'
            res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
            
        }, 10000);

        // Handle disconnect
        req.on('close', () => {
            console.log(`Client disconnected: ${userId}`);
            clearInterval(heartbeatInterval);
            removeClient(res);
            res.end();
        });

    } catch (err) {
        console.error("Error during SSE setup:", err);
        try {
            res.write(`data:${JSON.stringify({ type: "error", message: "Internal server error" })}\n\n`);
            res.end();
        } catch (_) {
            // If headers already sent, ignore
        }
    }
};


const testEvent=async(req:Request,res:Response):Promise<any>=>{

    try{

        const {message}=req.body;

        // sendMessageToUser('1',{type:"messageAdded",message,chatId});
        sendMessageToWebUser('26',{type:"agentMessage",message});

        return res.status(200).send({message:"done"});

    }catch(err:any){
        console.error(err.message);
        return res.status(500).send({status:false});
    }
}

const webEvent = async (req: Request, res: Response): Promise<void> => {
    try {

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write('retry: 5000\n\n');
        res.flushHeaders(); // Ensures headers are sent before anything else

        const id=req.query.id as string;
        const domain=req.query.domain as string;

        if (!id || !domain) {
            res.write(`data:${JSON.stringify({ type: "Invalid parameter" })}\n\n`);
            res.end();
            return;
        }

        const flowId = decryptId(id);

        if (!flowId) {
            res.write(`data:${JSON.stringify({ type: "Invalid Id" })}\n\n`);
            res.end();
            return;
        }


        console.log("New event subscriber:", flowId, domain);

        // Add client to list
        addWebClient(flowId, domain, res);
        console.log("Client added");

        // Initial connected message
        res.write(`data:${JSON.stringify({ type: "connected" })}\n\n`);

        // Handle disconnect
        req.on('close', () => {
            console.log(`Client disconnected: ${flowId}`);
            removeWebClient(res);
        });

    } catch (err) {
        console.error("Error during SSE setup:", err);
        try {
            res.write(`data:${JSON.stringify({ type: "error", message: "Internal server error" })}\n\n`);
            res.end();
        } catch (_) {
            // If headers already sent, ignore
        }
    }
};


export {chatEvent,testEvent,webEvent};


