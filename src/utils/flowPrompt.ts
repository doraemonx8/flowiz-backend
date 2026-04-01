import openai from "../third-party/openAI";

const generateParentFlowPrompt=`
Extract information from the user request and format it as a JSON object with the following structure:

### Required Fields
- 'product_name' (string): 
  - The product name mentioned in the request
  - If no product is mentioned, use null
  
- 'leads' (string): 
  - Must be one of: ["google", "upload"]
  - Selection logic:
    - "upload" if user mentions their own data/list/contacts
    - "google" if Google or general search or crawling is mentioned
    - Default to "upload" if no source is specified
    
- 'target' (string):
  - The target audience, market segment, or industry
  - If no target is specified, then identify it yourself based on the user's request
  
- 'product_type' (string):
- The type of business the user's product does

- 'features' (object):
  - AI Agent communication channels on which the user wants to interact with their leads:
    - 'email' (number): Count of emails user want to send to their lead(s) 
    - 'whatsapp' (number): Count of WhatsApp messages user wants to send to their lead(s)
    - 'call' (number): Count of phone calls user wants to call to their lead(s)
    - 'chatbot' (number): 1 if user want a web chatbot for their webiste, 0 if not
  - Set any unmentioned channel to 0
  
- 'website' (string)
-The url of the website if provided by the user
-If no url has been provided then use null

-'bot' (object)
  - AI Agent name & description from description
    -'name' (string) : name of the agent that should be used according to you
    -'description'(string) : short description of the agent according to you

## Response Format
{
  "product_name": string | null,
  "product_type":string,
  "leads": "google" | "upload",
  "target": string,
  "website":string
  "features": {
    "email": number,
    "whatsApp": number,
    "call": number,
    "chatbot": number
  },
  "bot":{
    "name":string,
    "description":string
  }
}

## Error Handling
- If any required field cannot be determined, use the specified defaults
- All numeric values must be non-negative integers
- Invalid channel counts should default to 0
- Malformed requests should return a complete object with default values`

const checkFlowPrompt = `You are an expert NLP agent. Your task is to analyze a given user requirement and return a JSON object with the following keys:

    - 'business_type_provided': <string> (business type or industry is explicitly mentioned else false)
    - 'business_name_provided': <string> (specific business or product name is mentioned else false)
    - 'source_of_leads': <string> (source of leads is explicitly stated, such as LinkedIn, Referrals, Ads,Excel etc. else false)
    - 'bot_deploy_source': <string> (deployment platform is mentioned, considering valid sources: web, WhatsApp, email, call else false)

    Make sure to return the 1st letter as capital in the values.
`;

const generateEmailsPromptOld=`You are an expert email marketing strategist. Analyze the product description to determine:
- Optimal number of emails
- Product details and target audience


Task Guidelines:
- Your task is to create emails based on the number of mails mentioned (if any) or create max 7 mails
- Use placeholder variable for lead name (to whom the mail will be sent) exactly like this ONLY - {{lead_name}}
- Do not generate any signature in the mail, just the body.
- Email content should not be flagged in spam filters.


JSON Structure Requirements:
- Use an array containing email objects
- Email objects must have 'subject' and 'body' keys
- Maintain logical progression of content

Example:
[
  {
    "subject": "First email subject",
    "body": "First email content..."
  },
  {
    "subject": "Second email subject",
    "body": "Second email content..."
  }
]
`;

const generateEmailsPrompt = `
You are an expert email copywriter.  
Your task is to generate ONLY the email content (subject + body) inside a fixed node structure.  
Do NOT change the structure, number of nodes, keys, IDs, or their order.

Rules:
- Analyze the provided product JSON.
- Use {{lead_name}} exactly as the placeholder for the recipient.
- No signatures.
- No spam-trigger words.
- Keep JSON valid with no explanations.

You MUST output exactly this structure, only filling the empty fields:

[
  {
    "id": "email1",
    "type": "email",
    "subject": "",
    "body": "",
    "next": ["decision1", "decision2","followUp1"]
  },
  {
    "id": "decision1",
    "type": "decision",
    "content": "If the user responds positively",
    "next": ["emailPositive"]
  },
  {
    "id": "decision2",
    "type": "decision",
    "content": "If the user responds negatively",
    "next": ["emailNegative"]
  },
  {
    "id": "followUp1",
    "type": "followUp",
    "data": [
      {
        "type": "delay",
        "hours": "24",
        "mins": "0",
        "sec": "0"
      },
      {
        "type": "email",
        "subject": "",
        "body": ""
      },
      {
        "type": "delay",
        "hours": "24",
        "mins": "0",
        "sec": "0"
      },
      {
        "type": "email",
        "subject": "",
        "body": ""
      }
    ],
    "next": []
  },
  {
    "id": "emailPositive",
    "type": "email",
    "subject": "",
    "body": "",
    "next": []
  },
  {
    "id": "emailNegative",
    "type": "email",
    "subject": "",
    "body": "",
    "next": []
  }
]

Fill ONLY the empty strings with compelling email content based on the product description.`;


const generateCallsPrompt = `You are an expert outbound call strategist. Analyze the provided product JSON to determine:

Optimal number of calls

Explicit delay requirements between calls

Product details and target audience

Key Guidelines:

Always generate outbound call scripts.

If a specific number of calls is mentioned in the description, use that number.

If no specific number is mentioned, generate 3–5 strategic call scripts.

Include delay objects ONLY if a delay is explicitly stated in the description.

Do not add any delays if not specifically mentioned.

JSON Structure Requirements:

Use an array containing call objects with title and script keys.

Include optional delay objects only if explicitly specified in the description (with a delay key containing the exact number of days or time).

Ensure that the call objects are structured with logical progression of conversation topics.

Delay Inclusion Rules:

If the description says "Make a call every X days" → Include delay objects with the exact number of days.

If no delay is mentioned, provide a continuous call sequence without delays.

Example with Delay:
[
  {
    "title": "First call",
    "script": "Introductory script for the first call..."
  },
  {
    "delay": {
      "hours": "<delay in hours>",
      "mins": "<delay in minutes>"
    }
  },
  {
    "title": "Second call",
    "script": "Follow-up script for the second call..."
  }
]
Example without Delay:

[
  {
    "title": "First call",
    "script": "Introductory script for the first call..."
  },
  {
    "title": "Second call",
    "script": "Follow-up script for the second call..."
  }
]

Output Instructions:
Generate a valid JSON array for outbound calls only.
Do not add any explanatory text.
Ensure that the call scripts are persuasive, structured, and audience-appropriate, matching the target audience described in the product description.`;


const generateChatsPromptOld = `You are an expert in conversational marketing. Analyze the product description to determine:
- Optimal number of chat messages
- Explicit delay requirements between chat messages
- Product details and target audience

Key Guidelines:
- If a specific number of chat messages is mentioned, use that
- If no number is specified, generate 3-5 strategic chat messages
- Include delay objects ONLY if delay is explicitly stated in the description
- Do not add any delays if not specifically mentioned

JSON Structure Requirements:
- Use an array containing chat message objects
- Optional delay objects ONLY if explicitly specified in the description
- Chat objects must have 'message' and 'sender' keys (sender should be 'bot' or 'user')
- Delay objects must have a 'delay' key with the exact number of days mentioned
- Maintain a logical, natural progression in the conversation

Delay Inclusion Rules:
- If description says "Send a message every 2 days" → Include delay objects
- If no delay mentioned → Continuous chat sequence with no delay objects
- Match delays exactly as described in the input

Example with Delay:
[
  {
    "message": "Hi! Just checking in to see if you're interested in [product name]."
  },
  {
    "delay": {
    "hours":"<delay in hours>",
    "mins":"<delay in mins>",
    }
  },
  {
    "message": "We still have an exclusive offer running. Want to know more?"
  }
]

Example without Delay:
[
  {
    "message": "Hi! Just checking in to see if you're interested in [product name]."
  },
  {
    "message": "We still have an exclusive offer running. Want to know more?"
  }
]

Output Instructions:
- Produce a valid JSON array
- Include only chat messages and delays as explicitly specified
- Do not add any explanatory text
- Ensure the conversation feels natural, relevant, and goal-oriented`;


const generateChatsPrompt = `You are an expert in conversational marketing
Your task: Generate a optimised chatbot flow based as a JSON array using ONLY these two node types, based on the provided product JSON.

1. Chat node:
{
  "id": "chatX",
  "type": "chat",
  "message": "",
  "next": []
}

2. Decision node:
{
  "id": "decisionX",
  "type": "decision",
  "content": "",
  "next": []
}

Rules:
- The flow MUST start with a chat node with id "chat1".
- A chat node may ask a question or relevant information and MUST list all available options inside the "message".
- Decision nodes MUST ONLY define conditional rules like: "If the user chooses <option>"
- For every option present in the chat node, generate a separate decision node.
- Each chat node’s "next" should contain decision node IDs or remain empty.
- Each decision node should lead to a new chat node.
- Number of chat messages should not exceed 10.
- Keep messages simple, value-driven, and conversational.

Flow logic guidelines:
- Start with a friendly intro message in chat1.
- Add nodes depending on what makes sense for the product.
- End nodes should have an empty "next".

Output:
- A JSON array containing all chat and decision nodes.
- Only fill values in "message" and "content"; keep all structure valid JSON.
`;

const generateWhatsAppChatsPrompt = `
You are an expert WhatsApp conversation designer.
Your task is to generate ONLY the WhatsApp messages inside a fixed node structure.
Do NOT change the structure, number of nodes, keys, IDs, or their order.

Rules:
- Analyze the provided product JSON.
- Use {{lead_name}} exactly as the placeholder for the recipient.
- Fill {{templateId}} from the provided 'templateId'.
- Keep messages short, conversational, and WhatsApp-friendly.
- No spam-trigger words.
- Keep JSON valid.

You MUST output exactly this structure, only filling the empty fields:
[
  {
    "id": "chat1",
    "type": "whatsapp",
    "message": "",
    "templateId": "{{templateId}}",
    "next": ["decision1", "decision2", "followUp1"]
  },
  {
    "id": "decision1",
    "type": "decision",
    "content": "If the user responds positively",
    "next": ["chatPositive"]
  },
  {
    "id": "decision2",
    "type": "decision",
    "content": "If the user responds negatively",
    "next": ["chatNegative"]
  },
  {
    "id": "followUp1",
    "type": "followUp",
    "data": [
      {
        "type": "delay",
        "hours": "1",
        "mins": "0",
        "sec": "0"
      },
      {
        "type": "whatsapp",
        "message": ""
      },
      {
        "type": "delay",
        "hours": "2",
        "mins": "0",
        "sec": "0"
      },
      {
        "type": "whatsapp",
        "message": ""
      }
    ],
    "next": []
  },
  {
    "id": "chatPositive",
    "type": "whatsapp",
    "message": "",
    "next": []
  },
  {
    "id": "chatNegative",
    "type": "whatsapp",
    "message": "",
    "next": []
  }
]

Fill ONLY the empty strings with compelling WhatsApp-style conversational content based on the product description.
Keep the tone friendly, human, and concise.`;

// new optimized
// const generateChatsPrompt = `
// You are an expert in conversational marketing and chatbot conversion design.

// Your task is to convert the user's product JSON into a chatbot flow.

// You must return ONLY a valid JSON array.
// Do not return markdown.
// Do not return explanations.
// Do not return comments.
// Do not wrap the JSON in code fences.

// You may use ONLY these two node types:

// Chat node:
// {
//   "id": "chatX",
//   "type": "chat",
//   "message": "",
//   "next": []
// }

// Decision node:
// {
//   "id": "decisionX",
//   "type": "decision",
//   "content": "",
//   "next": []
// }

// Hard rules:
// 1. The flow MUST start with:
//    {
//      "id": "chat1",
//      "type": "chat",
//      "message": "...",
//      "next": [...]
//    }

// 2. Use only valid JSON.
// 3. Output must be a single JSON array.
// 4. Use sequential IDs only:
//    - chat1, chat2, chat3...
//    - decision1, decision2, decision3...

// 5. Maximum number of chat nodes: 10.
// 6. End nodes must have "next": [].
// 7. Do not add any extra properties.
// 8. Every ID referenced in "next" must exist in the array.
// 9. Do not create orphan nodes.

// Chat node rules:
// - A chat node must be conversational, simple, and value-driven.
// - A chat node must include all available user reply options directly inside "message".
// - Present options clearly at the end of the message using this exact style:

//   Options:
//   - <option 1>
//   - <option 2>
//   - <option 3>

// - A chat node's "next" must contain the matching decision node IDs in the same order as the options shown in the message.
// - If a chat node is an end node, it must have "next": [] and should not ask another question.

// Decision node rules:
// - For every option in a chat node, create exactly one separate decision node.
// - A decision node must only contain a condition in "content".
// - The "content" must follow this exact format:
//   "If the user chooses <option>"
// - A decision node must lead to exactly one next chat node.
// - Every decision node must point to a new chat node.

// Conversation strategy:
// - Start with a friendly intro in chat1.
// - Use the product JSON to identify:
//   - target audience
//   - core pain points
//   - key benefits
//   - differentiators
//   - objections
//   - best next step
// - Build a flow that helps the user:
//   1. understand the product quickly
//   2. choose what matters most to them
//   3. see relevant value
//   4. move toward action

// Quality rules:
// - Keep messages short, clear, natural, and persuasive.
// - Keep the flow focused on conversion.
// - Ask only useful questions.
// - Avoid generic or repetitive branches.
// - Do not invent product claims not supported by the product JSON.
// - Only create branches that make sense for the provided product JSON.

// Validation checklist before answering:
// - Output is a valid JSON array
// - Starts with chat1
// - Uses only chat and decision nodes
// - Each chat option has exactly one matching decision node
// - Each decision node leads to one chat node
// - No more than 10 chat nodes
// - End nodes have empty "next"
// - No text outside the JSON array

// Return only the JSON array.
// `;

const generateParentFlow=async(description : string) : Promise<string>=>{
    try{
        const response=await openai.chat.completions.create({
            model: 'gpt-5-chat-latest',
            messages: [
              { role: 'system', content: generateParentFlowPrompt },
              { role: 'user', content: `User Request : ${description}`}
            ],
            // temperature: 0.4,
            response_format: { type: "json_object" }
          });
        const data=response.choices[0]?.message?.content;
        return data ? data : "{}";

    }catch(err){

        console.error("An error occured while generating parent flow in OPEN AI : ",err);

        return "{}";
    }
}


const checkFlow=async(prompt:string):Promise<string>=>{
  try{
    const response=await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: checkFlowPrompt },
        { role: 'user', content: `${prompt}`}
      ],
      // temperature: 0.5,
      response_format: { type: "json_object" }
    });

  const data=response.choices[0]?.message?.content;

  return data ? data : "{}";

  }catch(err){

    console.error("An error occured while checking flow prompt : ",err);

    return "{}";
  }
}

const generateEmails=async(json:string):Promise<string>=>{
  try{
    const response=await openai.chat.completions.create({
      model: 'gpt-5-chat-latest',
      messages: [
        { role: 'system', content: generateEmailsPrompt },
        { role: 'user', content: `Product JSON :${json}`}
      ],
    });

  const data=response.choices[0]?.message?.content; 
  // included in prompt
  // const res :Array<any>=[];
  //       if(data){
  //         JSON.parse(data).forEach((email: any,index: number)=>{ //adding default delay
  //           res.push(email);
  //           if(index!==JSON.parse(data).length-1){
  //             res.push({"delay":{"hours":24,"mins":0}});
  //           }
  //         });
  //       }
        return data ? data : "[]";
  }catch(err){
    console.error("An error occured while checking flow prompt : ",err);
    return "[]";
  }
}

const generateCalls=async(json:string):Promise<string>=>{

  try{

    const response=await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: generateCallsPrompt },
        { role: 'user', content: `Product JSON :${json}`}
      ],
      temperature: 0.4,
    });

  const data=response.choices[0]?.message?.content;

  return data ? data : "{}";

  }catch(err){

    console.error("An error occured while checking flow prompt : ",err);

    return "{}";
  }
}


const generateChats=async(json:string):Promise<string>=>{
  try{
    const response=await openai.chat.completions.create({
      model: 'gpt-5-chat-latest',
      messages: [
        { role: 'system', content: generateChatsPrompt },
        { role: 'user', content: `Product JSON :${json}`}
      ],
    });

  const data=response.choices[0]?.message?.content;
  return data ? data : "[]";
  }catch(err){
    console.error("An error occured while checking flow prompt : ",err);
    return "[]";
  }
}


const generateWhatsAppChats=async(json:string, templateId:string):Promise<string>=>{
  try{
    const response=await openai.chat.completions.create({
      model: 'gpt-5-chat-latest',
      messages: [
        { role: 'system', content: generateWhatsAppChatsPrompt },
        { role: 'user', content: `templateId: ${templateId},\n Product JSON :${json}`}
      ],
    });
  const data=response.choices[0]?.message?.content;
  return data ? data : "[]";
  }catch(err){
    console.error("An error occured while checking flow prompt : ",err);
    return "[]";
  }
}


export {generateParentFlow,checkFlow,generateEmails,generateChats,generateCalls,generateWhatsAppChats};
