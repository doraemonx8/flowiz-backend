export type BaseNode = {
  id: string
  next: string[]
}


export type EmailNode = BaseNode & {
  type: "email"
  subject: string
  body: string
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

export type FollowUpItem = DelayItem | FollowUpEmailItem


export type FollowUpNode = BaseNode & {
  type: "followUp"
  data: FollowUpItem[]
}


export type FlowNode =
  | EmailNode
  | DecisionNode
  | FollowUpNode

export type FlowData = FlowNode[]
