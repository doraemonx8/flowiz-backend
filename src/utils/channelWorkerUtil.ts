import { scheduleMessages } from "./scheduleUtil";
import { EmailNode } from "../types/flow.type";
// type EmailNode = {
//   id: string;
//   type: string;
//   data: {
//     subject: string;
//     body: string;
//     hourDelay?: string;
//     minDelay?: string;
//     secDelay?: string;
//     isFirst: boolean;
//     isLast: boolean;
//   };
//   next: string[] | null;
// };

export interface LeadData {
  id:    string | number;
  name:  string;
  email: string;
  phone: string;
  [key: string]: any;
}

// ─── Intent-reference → lead-field mapping ───────────────────────────────────
// Keys are the @intent names (without the @); values are the matching lead field.
// Add new entries here whenever a new @intent type is introduced on the frontend.
const INTENT_TO_LEAD_FIELD: Record<string, keyof LeadData> = {
  lead_name:  "name",
  lead_phone: "phone",
  lead_email: "email",
  lead_id:    "id",
};

// ─── Core helpers (shared by all channels) ───────────────────────────────────
/**
 * Resolve a single "@intent_reference" string to its real value from the lead.
 * "@lead_name "  → lead.name
 * "@lead_phone"  → lead.phone
 * Falls back to an empty string when the intent is unknown.
 */
export function resolveIntentRef(intentRef: string, lead: LeadData): string {
  const key = intentRef.trim().replace(/^@/, "");
  const field = INTENT_TO_LEAD_FIELD[key];
  if (field !== undefined && lead[field] != null) return String(lead[field]);
  // Graceful direct-field fallback (e.g. custom fields stored on the lead row)
  if (lead[key] != null) return String(lead[key]);
  return "";
}

/**
 * Build a variable-name → resolved-value map for a single node / item.
 * variableValues example : { "lead_name": "@lead_phone " }
 * Result                  : { "lead_name": "9876543210" }
 */
export function buildVariableMap(
  variableValues: Record<string, string> | undefined,
  lead: LeadData
): Record<string, string> {
  const map: Record<string, string> = {};

  // Always populate core lead fields first so {{lead_name}}, {{lead_email}},
  // {{lead_phone}} resolve even when the node has no variableValues configured.
  if (lead.name)  { map["lead_name"] = lead.name;  map["name"]  = lead.name;  }
  if (lead.email) { map["lead_email"] = lead.email; map["email"] = lead.email; }
  if (lead.phone) { map["lead_phone"] = lead.phone; map["phone"] = lead.phone; }
  if (lead.id)    { map["lead_id"] = String(lead.id); }

  if (!variableValues) return map;  // return map with lead fields

  if (Array.isArray(variableValues)) {
    for (const item of variableValues) {
      if (item && item.key && typeof item.value === 'string') {
        map[item.key.trim()] = resolveIntentRef(item.value, lead);
      }
    }
    return map;
  }

  // Handle standard object dictionary
  for (const [varName, intentRef] of Object.entries(variableValues)) {
    map[varName] = resolveIntentRef(intentRef, lead);
  }
  return map;
}

/**
 * Replace every {{variable_name}} in `text` using the supplied map.
 * Unknown placeholders are left as-is so they remain visible in logs.
 */
export function fillTemplate(
  text: string | undefined | null,
  variableMap: Record<string, string>
): string {
  if (!text) return text ?? "";
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, rawName: string) => {
    const key = rawName.trim();
    return key in variableMap ? variableMap[key] : `{{${key}}}`;
  });
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────

// function buildEmailSequence(nodes: EmailNode[], leadName: string) {
//   const nodeMap = new Map(nodes.map((node) => [node.id, node]));
//   const sequence: any[] = [];

//   let current: EmailNode | undefined = nodes.find((node) => node.data.isFirst);

//   let lastDelay: any = null;

//   let hourDelay = 0;
//   let minDelay = 0;
//   let count = 0;
//   if (!current) return [];
//   const { data, id } = current as EmailNode;
//   console.log("CURRENT UNDER CHANNELWORKERUTILS - ", current);
//   const scheduledFollowUps = scheduleMessages({ currentNodeId: id, flowData: nodes }, "email").map((job: any) => ({
//     ...job,
//     subject: job.subject?.replaceAll("{{lead_name}}", leadName),
//     body: job.body?.replaceAll("{{lead_name}}", leadName)
//   }));

//   return [
//     {
//       id,
//       subject: data.subject.replaceAll("{{lead_name}}", leadName),
//       body: data.body.replaceAll("{{lead_name}}", leadName)
//     },
//     ...scheduledFollowUps
//   ];
//   // return [
//   //   {
//   //     id,
//   //     subject : data.subject.replaceAll("{{lead_name}}",leadName),
//   //     body: data.body.replaceAll("{{lead_name}}",leadName)
//   //   },...scheduleMessages({currentNodeId : id,flowData:nodes},"email")
//   // ]
//   //  to be reviewed later
//   // while (current) {
//   //   const { data, next, type, id } = current;

//   //   if (type === "delayNode") {
//   //     lastDelay = { hours: data.hourDelay, mins: data.minDelay };
//   //     hourDelay += parseInt(data?.hourDelay as string);
//   //     minDelay += parseInt(data?.minDelay as string);
//   //   } else if (data.subject && data.body) {
//   //     hourDelay += count === 0 ? 0 : 24;  //default 24.5 hour delay
//   //     minDelay += count === 0 ? 0 : 30
//   //     // const name=leadName ? leadName.split(" ")[0] : "";
//   //     const email = {
//   //       id,
//   //       subject: data.subject.replaceAll("{{lead_name}}", leadName),
//   //       body: data.body.replaceAll("{{lead_name}}", leadName),
//   //       ...(lastDelay ? { delay: { hours: hourDelay, mins: minDelay } } : { delay: { hours: hourDelay, mins: minDelay } }),
//   //     };
//   //     sequence.push(email);
//   //     lastDelay = null;
//   //   }
//   //   count += 1;
//   //   const nextId = next && next.length > 0 ? next[0] : undefined;
//   //   current = nextId ? nodeMap.get(nextId) : undefined;
//   // }
//   // return sequence;
// }

function buildEmailSequence(nodes: EmailNode[], lead: LeadData): any[] {
  if (!Array.isArray(nodes)) {
    console.error("buildEmailSequence received invalid nodes:", nodes);
    return [];
  }
  const current: EmailNode | undefined = nodes.find((n) => n?.data?.isFirst);

  if (!current) {
    console.warn("No starting node found (isFirst)");
    return [];
  }

  console.log("CURRENT buildEmailSequence => ",current)
  console.log("CURRENT buildEmailSequence leads=> ",lead)
 
  const { data, id } = current;
  const varMap = buildVariableMap(
    (data as any).variableValues as Record<string, string> | undefined,
    lead
  );
 
  const scheduledFollowUps = scheduleMessages(
    { currentNodeId: id, flowData: nodes },
    "email"
  ).map((job: any) => {
    console.log("followUpVarMap => ",job.variableValues)
  console.log("followUpVarMap leads=> ",lead)
    const followUpVarMap = buildVariableMap(job.variableValues, lead);
    return {
      ...job,
      subject: fillTemplate(job.subject, followUpVarMap),
      body:    fillTemplate(job.body,    followUpVarMap),
    };
  });
 
  return [
    {
      id,
      subject: fillTemplate(data.subject, varMap),
      body:    fillTemplate(data.body,    varMap),
    },
    ...scheduledFollowUps,
  ];
}

// const createEmailJobsDataFromFlow = (subFlow: any, leadName: string) => {
//   try {
//     const isJsonData = subFlow.json && (!subFlow.flowData || !subFlow.flowData.length);
//     //if json data then loop over it to create email jobs
//     if (isJsonData) {

//       //only first email needs to be sent
//       console.log("SubFlow UNDER CHANNELWORKERUTILS - ", subFlow)
//       const emailData = subFlow.json[0];
//       const scheduledFollowUps = scheduleMessages({ currentNodeId: emailData.id, flowData: subFlow.json }, "email").map((job: any) => ({
//         ...job,
//         subject: job.subject?.replaceAll("{{lead_name}}", leadName),
//         body: job.body?.replaceAll("{{lead_name}}", leadName)
//       }));

//       return [{
//         id: emailData.id,
//         subject: emailData.subject.replaceAll("{{lead_name}}", leadName),
//         body: emailData.body.replaceAll("{{lead_name}}", leadName)
//       }, ...scheduledFollowUps];
//       // return [{

//       //   id : 0,
//       //   subject : emailData.subject.replaceAll("{{lead_name}}",leadName),
//       //   body: emailData.body.replaceAll("{{lead_name}}",leadName)
//       // },...scheduleMessages({currentNodeId : 0,flowData:subFlow.json},"email")];
//       let hourDelay = 0;
//       let minDelay = 0;
//       const data = subFlow.json.map((item: any, index: number) => {
//         //skip if delay
//         if ('delay' in item && !('subject' in item)) {
//           return null;
//         }

//         const prevItem = subFlow.json[index - 1];
//         const hasPrevDelay = prevItem && 'delay' in prevItem;

//         if (hasPrevDelay) {
//           hourDelay += parseInt(prevItem.delay.hours);
//           minDelay += parseInt(prevItem.delay.mins);
//         } else {
//           hourDelay += index === 0 ? 0 : 24;  //default 24.5 hour delay
//           minDelay += index === 0 ? 0 : 30
//         }
//         // const values = {
//         //   "@lead_name": leadName,
//         //   "@lead_phone": "9876543210",
//         //   "@location": "Delhi"
//         // };
//         return {
//           id: index,
//           subject: item.subject.replaceAll("{{lead_name}}", leadName),
//           body: item.body.replaceAll("{{lead_name}}", leadName),
//           ...(hasPrevDelay ? { delay: { hours: hourDelay, mins: minDelay } } : { delay: { hours: hourDelay, mins: minDelay } }),
//         };
//       }).filter(Boolean);

//       return data;
//     } else {
//       const data = buildEmailSequence(subFlow.flowData, leadName);
//       return data;
//     }
//   } catch (err) {

//     console.error("An error occured while creating emails jobs : ", err);
//     return [];
//   }
// }

// const fillPlaceholders = (text: string, values: Record<string, string | number>): string => {
//   let output = text;
//   for (const [intent, value] of Object.entries(values)) {
//     const key = intent.replace("@", "");  // converts @lead_name → lead_name
//     const placeholder = `{{${key}}}`;     // convert to {{lead_name}}
//     output = output.replaceAll(placeholder, String(value));
//   }
//   return output;
// }

/**
 * Main entry point for EMAIL jobs, called by the campaign worker.
 *
 * Two storage formats supported:
 *   • json     – AI-generated flat array  { id, subject, body, variableValues, next }
 *   • flowData – React-Flow visual nodes  { id, type, data: { subject, body, variableValues } }
 */
export const createEmailJobsDataFromFlow = (
  subFlow: any,
  lead: LeadData
): any[] => {
  try {
    const isJsonData =
      subFlow.json && (!subFlow.flowData || !subFlow.flowData.length);
 
    if (isJsonData) {
      const emailData = subFlow.json[0];
      // variableValues may live at the top level or nested inside data
      const topLevelVarValues: Record<string, string> | undefined =
        emailData.variableValues ?? emailData.data?.variableValues;

      console.log("CURRENT varMap => ",topLevelVarValues)
      console.log("CURRENT varMap leads=> ",lead)  
      const varMap = buildVariableMap(topLevelVarValues, lead);
 
      const rawSubject: string = emailData.subject ?? emailData.data?.subject ?? "";
      const rawBody:    string = emailData.body    ?? emailData.data?.body    ?? "";
 
      const scheduledFollowUps = scheduleMessages(
        { currentNodeId: emailData.id, flowData: subFlow.json },
        "email"
      ).map((job: any) => {
        console.log("followUpVarMap createEmailJobsDataFromFlow => ",job.variableValues)
  console.log("followUpVarMap createEmailJobsDataFromFlow leads=> ",lead)
        const followUpVarMap = buildVariableMap(job.variableValues, lead);
        return {
          ...job,
          subject: fillTemplate(job.subject, followUpVarMap),
          body:    fillTemplate(job.body,    followUpVarMap),
        };
      });
 
      return [
        {
          id:      emailData.id,
          subject: fillTemplate(rawSubject, varMap),
          body:    fillTemplate(rawBody,    varMap),
        },
        ...scheduledFollowUps,
      ];
    }
 
    return buildEmailSequence(subFlow.flowData, lead);
  } catch (err) {
    console.error("An error occurred while creating email jobs:", err);
    return [];
  }
};

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
 
/**
 * Resolve all {{placeholders}} in a single WhatsApp node's message field.
 * Node shape (json / flat format):
 *   { id, type:"whatsapp", message:"Hi {{lead_name}}", variableValues:{…}, templateId, next }
 * Node shape (React-Flow / flowData format):
 *   { id, type:"whatsappNode", data:{ message, variableValues, templateId, … } }
 */
export function resolveWhatsAppNodeMessage(
  node: Record<string, any>,
  lead: LeadData
): string {
  const rawMessage: string  = node.message       ?? node.data?.message       ?? "";
  const varValues            = node.variableValues ?? node.data?.variableValues;
  console.log("resolveWhatsAppNodeMessage => ",varValues)
  console.log("resolveWhatsAppNodeMessage leads=> ",lead)
  return fillTemplate(rawMessage, buildVariableMap(varValues, lead));
}
 
/**
 * Build the ordered WhatsApp job sequence for a campaign, including follow-ups
 * inside scheduleNode / followUp nodes — with all {{placeholders}} resolved.
 * Used by the campaign worker instead of accessing firstMessageNode.data directly.
 */
export const createWhatsAppJobsDataFromFlow = (
  subFlow: any,
  lead: LeadData
): any[] => {
  try {
    const isJsonData =
      subFlow.json && (!subFlow.flowData || !subFlow.flowData.length);
 
    const flowNodes: any[] = isJsonData ? subFlow.json : subFlow.flowData;
    if (!flowNodes?.length) return [];
 
    // Find the first node (isFirst flag or fallback to index 0)
    const firstNode: any =
      flowNodes.find((n: any) => n.data?.isFirst === true || n.isFirst === true) ??
      flowNodes[0];
 
    if (!firstNode) return [];
 
    // Resolve the first message
    const firstMessage = resolveWhatsAppNodeMessage(firstNode, lead);

    const varValues = firstNode.variableValues ?? firstNode.data?.variableValues;
    const varMap = buildVariableMap(varValues, lead);
 
    // Resolve follow-up messages
    const scheduledFollowUps = scheduleMessages(
      { currentNodeId: firstNode.id, flowData: flowNodes },
      "whatsapp"
    ).map((job: any) => {
      const jobVarMap = buildVariableMap(job.variableValues, lead);
      return {
        ...job,
        message: fillTemplate(job.message, jobVarMap),
        varMap: jobVarMap, 
        templateParams: job.templateParams ?? job.data?.templateParams
      };
    });
 
    return [
      {
        id:           firstNode.id,
        message:      firstMessage,
        templateId:   firstNode.templateId   ?? firstNode.data?.templateId,
        templateFile: firstNode.templateFile ?? firstNode.data?.templateFile,
        rawData:      firstNode.data ?? firstNode,
        varMap:       varMap, 
        templateParams: firstNode.templateParams ?? firstNode.data?.templateParams
      },
      ...scheduledFollowUps,
    ];
  } catch (err) {
    console.error("An error occurred while creating WhatsApp jobs:", err);
    return [];
  }
};

// ─── CALL ─────────────────────────────────────────────────────────────────────

export interface CallJobData {
  id: string;
  title: string;
  script: string;
  delay: { hours: string; mins: string } | null;
}


export const createCallJobsDataFromFlow = (
  subFlow: any,
  lead: LeadData
): CallJobData[] => {
  try {
    const isJsonData =
      subFlow.json && (!subFlow.flowData || !subFlow.flowData.length);
    const flowNodes: any[] = isJsonData ? subFlow.json : subFlow.flowData;

    if (!flowNodes?.length) return [];

    const firstNode: any =
      flowNodes.find((n: any) => n.isFirst === true) ??
      flowNodes.find((n: any) => n.id === "call1") ??
      flowNodes.find((n: any) => n.type === "call");

    if (!firstNode) return [];

    const varMap = buildVariableMap(
      firstNode.variableValues ?? firstNode.data?.variableValues,
      lead
    );

    const rawTitle  = firstNode.title  ?? firstNode.data?.title  ?? "";
    const rawScript = firstNode.script ?? firstNode.data?.script ?? firstNode.data?.prompt ?? "";

    // Get no-answer retry calls from followUp nodes
    const scheduledRetries = scheduleMessages(
      { currentNodeId: firstNode.id, flowData: flowNodes },
      "call"
    ).map((job: any) => {
      const retryVarMap = buildVariableMap(job.variableValues, lead);
      return {
        id:     `retry_${firstNode.id}_${job.delay?.hourDelay ?? 0}h`,
        title:  fillTemplate(job.title  ?? "", retryVarMap),
        script: fillTemplate(job.script ?? "", retryVarMap),
        delay:  job.delay
          ? { hours: String(job.delay.hourDelay), mins: String(job.delay.minDelay) }
          : null,
      };
    });

    return [
      {
        id:     firstNode.id ?? "call1",
        title:  fillTemplate(rawTitle,  varMap),
        script: fillTemplate(rawScript, varMap),
        delay:  null,
      },
      ...scheduledRetries,
    ];
  } catch (err) {
    console.error("An error occurred while creating call jobs:", err);
    return [];
  }
};


// ─── Legacy helper ───────────────────────────────────
// const createJobsFromFlow = (flow: any) => {
//   try {

//     let hourDelay = 0;
//     let minDelay = 0;

//     return flow.data.map((node: any) => {

//       if (node.type == "delay") {
//         hourDelay += node.hours;
//         minDelay += node.mins;
//       } else if (node.type === "email") {
//         return {
//           id: node.id,
//           subject: node.subject,
//           body: node.body,
//           delay: { hours: hourDelay, mins: minDelay }
//         }
//       }
//     });


//   } catch (err) {
//     console.error("an error occured while creating whatsapp jobs", err);
//     return [];
//   }
// }

const createJobsFromFlow = (flow: any) => {
  try {
    let hourDelay = 0;
    let minDelay  = 0;
 
    return flow.data
      .map((node: any) => {
        if (node.type === "delay") {
          hourDelay += node.hours;
          minDelay  += node.mins;
          return null;
        }
        if (node.type === "email") {
          return {
            id:      node.id,
            subject: node.subject,
            body:    node.body,
            delay:   { hours: hourDelay, mins: minDelay },
          };
        }
        return null;
      })
      .filter(Boolean);
  } catch (err) {
    console.error("An error occurred while creating jobs from flow:", err);
    return [];
  }
};

export { createJobsFromFlow }
