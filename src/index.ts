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
import campaignRouter from './routes/campaignRoutes';
import eventRouter from './routes/eventRoutes';
import botRouter from './routes/botRoutes';
// import zohoRouter from './routes/zohoRoutes';
// import outlookRouter from './routes/outlookRoutes';
// import googleRouter from './routes/googleRoutes';
import metaRouter from './routes/metaRoutes';
import dashboardRouter from './routes/dashboardRoutes';
import leadRouter from './routes/leadRoutes';
import emailRouter from './routes/emailRoutes';
import quotaRouter from './routes/quotaRoutes';
import verifyJWT from './authMiddleware';

import lemonSqueezyRouter from './routes/lemonSqueezyRoutes';
import authRouter from './routes/authRoutes';
import audienceRouter from './routes/audienceRoutes';

//importing workers
import { campaignWorker } from './workers/campaignWorker';
import { webhook } from './controllers/metaController';
import getClusterInstance from './config/initCluster';
import uploadRouter from './routes/uploadRoutes';
import manualLeadRouter from './routes/manualLeadRoutes';

const campaignW1 = campaignWorker; // do not comment

const app: Express = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());

app.post('/meta/webhook', express.raw({ type: 'application/json' }), webhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

connectMongo();

const API_PREFIX = '/api';

app.use(`${API_PREFIX}/faq`, faqRouter);
app.use(`${API_PREFIX}/chats`, chatRouter);
app.use(`${API_PREFIX}/agent`, agentRouter);
app.use(`${API_PREFIX}/flow`, flowRouter);
app.use(`${API_PREFIX}/templates`, templateRouter);
app.use(`${API_PREFIX}/campaign`, campaignRouter);
app.use(`${API_PREFIX}/events`, eventRouter);
app.use(`${API_PREFIX}/bot`, botRouter);
// app.use("/zoho",zohoRouter);
// app.use("/outlook",outlookRouter);
// app.use("/google",googleRouter);
app.use(`${API_PREFIX}/meta`, metaRouter);
app.use(`${API_PREFIX}/dashboard`, dashboardRouter);
app.use(`${API_PREFIX}/leads`, leadRouter);
app.use(`${API_PREFIX}/email`, emailRouter);
app.use(`${API_PREFIX}/quota`, quotaRouter);

app.use(`${API_PREFIX}/lemon`, lemonSqueezyRouter);
app.use(`${API_PREFIX}/auth`, authRouter);
app.use(`${API_PREFIX}/audience`, audienceRouter);
app.use(`${API_PREFIX}/multer`, uploadRouter);

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Welcome to TypeScript Express' });
});

app.get('/check-token', verifyJWT, (req: Request, res: Response) => {
  res.json({ message: 'Done', data: req.body });
});

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
