import { Queue, QueueOptions } from "bullmq";
import IORedis from "ioredis";

// Create Redis connection
const connection = new IORedis({ 
  host:'127.0.0.1',
  port:6379,  
  maxRetriesPerRequest: null 
});

// Define queue options type
const queueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 50,
    attempts: 3,
  },
};


const emailQueue = new Queue("email-queue", {
  ...queueOptions,
  defaultJobOptions: {
    ...queueOptions.defaultJobOptions,
    backoff: { type: "exponential", delay: 5000 },
  },
});

const whatsappQueue = new Queue("whatsapp-queue", {
  ...queueOptions,
  defaultJobOptions: {
    ...queueOptions.defaultJobOptions,
    backoff: { type: "exponential", delay: 2000 },
  },
});

const callQueue = new Queue("call-queue", {
  ...queueOptions,
  defaultJobOptions: {
    ...queueOptions.defaultJobOptions,
    backoff: { type: "exponential", delay: 20000 },
  },
});

const campaignQueue = new Queue("campaign-queue", {
  ...queueOptions,
  defaultJobOptions: {
    ...queueOptions.defaultJobOptions,
    removeOnFail: 5,
    backoff: { type: "exponential", delay: 20000 },
  },
});

const inboxQueue = new Queue("inbox-queue",{
  ...queueOptions,
  defaultJobOptions:{
    ...queueOptions.defaultJobOptions,
    backoff:{type:"exponential",delay:10000}
  }
})








export { emailQueue, whatsappQueue, callQueue, campaignQueue, inboxQueue };
