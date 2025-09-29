import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import connectMongo from './config/mongodb';
import faqRouter from './routes/faqRoutes';
import chatRouter from './routes/chatRoutes';
import agentRouter from './routes/agentRoutes';
import flowRouter from './routes/flowRoutes';
import templateRouter from './routes/templateRoutes';
import campaignRouter from "./routes/campaignRoutes";
import eventRouter from "./routes/eventRoutes";
import botRouter from './routes/botRoutes';
// import zohoRouter from './routes/zohoRoutes';
// import outlookRouter from './routes/outlookRoutes';
// import googleRouter from './routes/googleRoutes';
import metaRouter from './routes/metaRoutes';
import dashboardRouter from './routes/dashboardRoutes';
import leadRouter from './routes/leadRoutes';
import emailRouter from './routes/emailRoutes';
import verifyJWT from './authMiddleware';


//importing workers
import {campaignWorker} from "./workers/campaignWorker";
import { webhook } from './controllers/metaController';
import getClusterInstance from './config/initCluster';

const campaignW1=campaignWorker; // do not comment


const app: Express = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());

app.post(
  '/meta/webhook',
  express.raw({ type: 'application/json' }),
  webhook
);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


connectMongo();

app.use('/faq',faqRouter);
app.use('/chats',chatRouter);
app.use('/agent',agentRouter);
app.use('/flow',flowRouter);
app.use('/templates',templateRouter);
app.use('/campaign',campaignRouter);
app.use('/events',eventRouter);
app.use('/bot',botRouter);
// app.use("/zoho",zohoRouter);
// app.use("/outlook",outlookRouter);
// app.use("/google",googleRouter);
app.use("/meta",metaRouter);
app.use("/dashboard",dashboardRouter);
app.use('/leads',leadRouter);
app.use('/email',emailRouter);

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to TypeScript Express' });
});


app.get('/check-token',verifyJWT,(req:Request,res:Response)=>{

  res.json({message:"Done",data:req.body});
})


// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down application...');
    try {
        const cluster = await getClusterInstance();
        if (cluster) {
            await cluster.close(); // Close the cluster gracefully
            console.log('Cluster closed successfully.');
        }
    } catch (error) {
        console.error('Error while shutting down the cluster:', error);
    }
    process.exit(0);
});

app.listen(port, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});
