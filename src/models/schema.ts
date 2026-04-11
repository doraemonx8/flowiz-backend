import { Schema,Document,model } from "mongoose";

type EmailAuth = {
  type : string;
  host : string;
  email : string;
  password : string;
}
interface IChat extends Document {
    companyId: string;
    campaignId: string,
    userId: string;
    adminId:string;
    agentId:string;
    emailAuth?:EmailAuth
    flowId:string;
    botRole:string;
    currentFlowNodeId:string | number;
    isAgentHandover:boolean;
    isCompleted:boolean;
    sentiment:string;
    messages: Array<Record<string,any>>;
    intents:Record<string,any>;
    channel:string;
    createdOn: any;
    isDeleted:boolean
    channels:any
    flowData:any
    ip:string
    userAgent:string
    phoneNumberId:string
    userPhone:string

    callTaskId?: string;
    callSessionId?: string;
    callSid?: string;
    callDuration?: number;
    callStatus?: string;
    callSummary?: string;
    recordingUrl?: string;
  }


const ChatSchema = new Schema<IChat>({
  _id: { type: String } as any,
  campaignId: { type: String, required: false },
  companyId: { type: String, required: true },
  userId: { type: String, required: true },
  adminId:{type:String},
  agentId: { type: String, required: false },
  emailAuth :{type:String},
  flowId: { type: String, required: true },
  ip:{type:String},
  userAgent:{type:String},
  phoneNumberId:{type:String},
  userPhone:{type:String},
  flowData:{type:String,required:true},
  botRole:{type:String},
  currentFlowNodeId: { type: String, required: true },
  isAgentHandover: { type: Boolean, default: false },
  isCompleted: { type: Boolean, default: false },
  sentiment: { type: String, required: true },
  channel:{type:String,required:true},
  messages: { type: [Object], default: [] }, // Array of objects
  intents: { type: Object, default: {} }, // Object
  createdOn: { type: Number, default: () => Math.floor(Date.now() / 1000) }, // Store as Unix timestamp
  isDeleted: { type: Boolean, default: false },

  callTaskId:    { type: String, required: false },  // Celery task id
  callSessionId: { type: String, required: false },  // Python session_id
  callSid:       { type: String, required: false },  // Acefone call_id
  callDuration:  { type: Number, required: false },
  callStatus:    { type: String, required: false },
  callSummary:   { type: String, required: false },
  recordingUrl:  { type: String, required: false },
});



interface IJob extends Document {
    companyId: string;
    userId: string;
    leadId:string;
    flowId:string;
    campaignId:string
    channel:string;
    status:string;
    reason?:string;
    createdOn?:any;
}


const JobSchema = new Schema<IJob>({
  _id: { type: String } as any,
  companyId: { type: String, required: true },
  userId: { type: String, required: true },
  leadId:{type:String,required:true},
  flowId: { type: String, required: true },
  campaignId:{type:String,required:true},
  channel:{type:String,required:true},
  status:{type:String,required:true},
  reason:{type:String},
},{timestamps:true});

const Chat = model<IChat>("Chat", ChatSchema);
export const Job = model<IJob>("Job",JobSchema);
export default Chat;
