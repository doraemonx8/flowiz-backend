export type BaseNode = {
  id: string
  next: string[]

}


export type EmailNode = BaseNode & {
  type: "email"
  data : {
    subject: string
    body: string
    hourDelay?: string;
    minDelay?: string;
    secDelay?: string;
    isFirst: boolean;
    isLast: boolean;
  }
  
}

export type WhatsappNode = BaseNode & {
  type :"whatsappNode"
  data : {
    prompt:string;
    message:string;
    template:string;
    templateFile:string;
    variableValues:Record<string,string>

  }
}


export type DecisionNode = BaseNode & {
  type: "decision"
  content: string
}


export type DelayItem = {
  type: "delay"
  hours: string
  mins: string
  sec: string
}


export type FollowUpEmailItem = {
  type: "email"
  subject: string
  body: string
}

export type FollowUpWhatsappItem = {
  type : "template" | "text"
  variableValues : Record<string,string>
  template?:string
  templateFile?:string
  message?:string
}

export type FollowUpItem = DelayItem | FollowUpEmailItem | FollowUpWhatsappItem


export type FollowUpNode = BaseNode & {
  type: "followUp"
  data: FollowUpItem[]
}


export type FlowNode =
  | EmailNode
  | DecisionNode
  | FollowUpNode
  | WhatsappNode

export type FlowData = FlowNode[]
