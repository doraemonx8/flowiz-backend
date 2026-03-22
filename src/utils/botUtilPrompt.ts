import openai from "../third-party/openAI";

const extractDataPrompt = `You are a helpful assistant designed to extract data from a user's message based on provided variables. 
You'll be given:
1. A user's message.
2. A 'rules' text which specifies any additional rules or instructions.
3. An array of objects of key-value pairs named 'variables', which specifies the data to extract , its type and if it is required.
4. An 'intents' object, which contains previously captured data.
5. A chat context, which have atmost last 10 messages between the user and the bot.
6. A boolean of is_intent_updated stating whether the given message has some updated intent value. If it is true then find it from the user's message and also map it with the 'intents' object.

Your tasks are:
1. Extract the data as mentioned in the variables array from the user's message.
2. If there are any extra rules or conditions defined by the 'rules' text then make sure to include them to validate the extracted data
3. Handle any updates to existing variables.
4. Return the results in JSON format.

**Example Response**
{<key of the data extracted same as in 'variables'> : <value>,...,"status":<true only if all variable values have been captured else false>,"missingFields":[<array of the missing variables that could not be extracted>],"updated_intent":<optional if any intent has been updated>}.

If you cannot extract all the required data, ask the user to provide it and send status false. If you do find updated data then send its name in key of "updated_intent".`;






const decisionPrompt = `You are an advanced decision-making assistant for a conversational AI system. Your task is to evaluate user inputs against predefined decision conditions and determine the next step in the conversation flow. You will be provided with:

A list of decision conditions, each with a format like {"checkFor": "[variable] condition", "next_node": "number"}.
A string object named 'Intents' which has all the data that has been captured till now.

Your responsibilities:

Interpret the decision conditions:

Variables in square brackets (e.g., [term_insurance_for]) refer to keys in the Intents object.
Conditions can be expressed in various formats, including but not limited to:

"[variable]==value" or "[variable] equal to value" or "[variable]=value"
"[variable]!=value" or "[variable] not equal to value"
"[variable]>value" or "[variable] greater than value"
"[variable]<value" or "[variable] less than value"
"[variable]>=value" or "[variable] greater than or equal to value"
"[variable]<=value" or "[variable] less than or equal to value"




Evaluate the conditions:

Replace variables with their corresponding values from the Intents.
Perform the specified comparison, accounting for different phrasings.
Handle string comparisons case-insensitively and consider semantic equivalence (e.g., "self", "me", "myself" are equivalent).


Determine the next node:

If a condition is true, select its corresponding next_node.
If multiple conditions are true, choose the first true condition in the list.


Return the result in JSON format:
{"next_node": "number", "status": "true/false", "message": "optional explanation"}
Error Handling:

If no conditions are met, return {"status": "false", "message": "No matching condition found","reason":"the conditions defined have no case that can be matched"}.
For any other errors, provide a descriptive error message.



Examples:

Input:

Intents: {"term_insurance_for": "self"}
Decisions: [
{"checkFor": "[term_insurance_for] equal to self", "next_node": "4"},
{"checkFor": "[term_insurance_for] not equal to self", "next_node": "18"}
]

Response: {"next_node": "4", "status": "true"}
Input:

Intents: {"term_insurance_for": "for my mother"}
Decisions: [
{"checkFor": "[term_insurance_for]=self", "next_node": "4"},
{"checkFor": "[term_insurance_for]!=self", "next_node": "18"}
]

Response: {"next_node": "18", "status": "true"}
Input:

Intents: {"age": 25}
Decisions: [
{"checkFor": "[age] greater than or equal to 18", "next_node": "5"},
{"checkFor": "[age] less than 18", "next_node": "6"}
]

Response: {"next_node": "5", "status": "true"}
Input:

Intents: {"income": 50000}
Decisions: [
{"checkFor": "[income]>100000", "next_node": "7"},
{"checkFor": "[income] less than or equal to 100000", "next_node": "8"}
]

Response: {"next_node": "8", "status": "true"}
Input:

Intents: {"term_insurance_for": "myself"}
Decisions: [
{"checkFor": "[term_insurance_for] equal to self", "next_node": "4"},
{"checkFor": "[term_insurance_for] not equal to self", "next_node": "18"}
]

Response: {"next_node": "4", "status": "true", "message": "Interpreted 'myself' as equivalent to 'self'"}


Always strive for accurate decision-making while handling various condition formats, edge cases, and providing informative feedback when necessary.
`;






const analyzeUserSentiment=`You're an expert assistant specializing in sentiment analysis for user messages in ongoing conversations. Your task is to analyze the provided context and previously captured intents to accurately categorize the sentiment.
Input:

1-A chat context array of the last 10 messages. Each message object has two properties:

'message': The content of the message (string)
'isBot': A boolean indicating whether the message is from you (true) or the user (false)
The most recent messages are at the beginning of the array.


2-A string object named 'Intents' containing all the data that we have captured so far.

3- A string object named 'Variables' containing the data to be captured (can be empty too)


Output:
Return the result in JSON format as {"sentiment":"category"}.
Sentiment Categories:

proceed: User is ready to continue or move forward
stop: User explicitly states that they want to end the conversation and uses word like 'stop','later','bye'.Remember that the word 'No','not yet','not right now' can be answer to a question.
general_query: User is asking for information or clarification and asking questions using words like 'What','When','Where','How' etc.
update_data: User explicitly states they want to update, modify, clarify, or correct previously provided information and uses word like 'update','clarify','correct','mistakenly','typo'. Also if the user is changing any data that has been captured already and is not being asked in the present context.
agent_handover: User requests to speak with a human representative explicitly
restart: User requests to restart the conversation flow from the beginning

Guidelines:

1. Analyze the user's intent and tone, considering the context of previous messages and captured intents.
2. For the 'update_data' category, only use this when the user explicitly states they want to update, modify, clarify, or correct previous information. Do not infer this sentiment if it's not clearly stated.
3. Consider the flow of conversation and how the user's message relates to previous bot prompts.
4. If a message could fit multiple categories, prioritize based on the following order: update_data > restart > agent_handover > general_query > proceed > stop
5. For the 'restart' category, look for clear indications that the user wants to begin the entire conversation or process anew.
6. Ensure your response is only the JSON object, with no additional text.
7. When considering 'stop' or 'general_query' or 'restart' sentiments, always check the last bot message:
   - If the bot's last message was a question or prompt for specific information, and the user's response appears to be answering that question, prioritize 'proceed' over 'stop' or 'general_query' or 'restart'.
   - Only categorize as 'stop' if the user explicitly expresses a desire to end the conversation, regardless of the bot's last message.
   - Only categorize as 'general_query' if the user's question is not directly related to answering the bot's last prompt or question.
   - Only categorize as 'restart' if the user explicitly expresses a desire to restart the entire flow/conversation.

Examples:
Input: "Why do you need my annual income?"
Output: {"sentiment":"general_query"}
Input: "What's up man?"
Output: {"sentiment":"proceed"}
Input: "I want to clarify that my correct date of birth is 24-03-1999."
Output: {"sentiment":"update_data"}
Input: "I need to update my income information."
Output: {"sentiment":"update_data"}
Input: "I will do this later."
Output: {"sentiment":"stop"}
Input: "What should I do next?"
Output: {"sentiment":"proceed"}
Input: "Can you transfer me to a human agent?"
Output: {"sentiment":"agent_handover"}
Input: "My income is $75,000."
Output: {"sentiment":"proceed"}
Input: "I'm confused about all these questions. Can I speak to someone?"
Output: {"sentiment":"agent_handover"}
Input: "I want to restart"
Output: {"sentiment":"restart"}
Input: "Let's start over from the beginning"
Output: {"sentiment":"restart"}
Input : "Bye"
Output:{"sentiment":"stop"}
Input: "Can we go back to the first question and start again?"
Output: {"sentiment":"restart"}

Remember to carefully consider the user's explicit statements when determining if they are requesting to update information. 
The 'update_data' sentiment should only be used when the user clearly expresses a desire to modify previously provided information. For all other cases where new information is provided without an explicit update request, use the appropriate sentiment based on the context of the conversation.
Remember to carefully consider the context, especially the bot's last message, when determining the sentiment. The 'stop' and 'general_query' sentiments should only be used when they clearly don't relate to answering the bot's last question or prompt. For all other cases where the user is providing information or responding to the bot's last message, use the 'proceed' sentiment or other appropriate sentiments based on the context of the conversation.
`



const giveMetaMessagePrompt=`You are tasked with analyzing a question and its corresponding answer to generate a structured response in JSON format for WhatsApp API.You will be given the answer asked by the user and necessary context to answer it. The JSON should have the following structure:

{
  "type": "cta_url",
  "body": {
    "text": "<answer of the question>"
  },
  "action": {
    "name": "cta_url",
    "parameters": {
      "display_text": "<as present in answer>",
      "url": "<as present in answer>"
    }
  }
}
Follow these steps:

Extract the complete answer from the provided text.
Identify and extract any display text (e.g., "Check profile") and associated URLs (e.g., LinkedIn profile links) from the answer.
Construct the JSON object using the extracted values:
Place the full answer text inside the "text" field of the "body".
Use the identified display text in the "display_text" field.
Include the extracted URL in the "url" field.
If there is no display text or URL in the answer, leave those fields blank.

`

const analyzeEmailReplySentiment = `You are an expert assistant specializing in analyzing email replies in sales/marketing email campaigns.
Your task is to determine whether the recipient's reply to a campaign email is positive, negative, or neutral.

Input:
1. The user's email reply text.
2. The previous email messages in this conversation thread (array of message objects with 'message', 'subject', and 'isBot' properties).

Output:
Return the result in JSON format as {"sentiment": "category"}.

Sentiment Categories:
- positive: The user shows interest, asks for more info, wants to schedule a call/meeting, agrees to proceed, or expresses enthusiasm about the product/service.
- negative: The user explicitly declines, asks to be removed, says they are not interested, requests to stop emailing, or expresses displeasure.
- neutral: The user's response is ambiguous, asks a general question without clear interest or disinterest, or provides an auto-reply/out-of-office.

Guidelines:
1. Focus on the most recent reply from the user, but consider the conversation thread for context.
2. If the user is asking clarifying questions about the product/service, categorize as "positive" since it shows engagement.
3. Words like "unsubscribe", "stop", "remove me", "not interested", "no thanks" strongly indicate "negative".
4. Words like "tell me more", "interested", "let's connect", "schedule", "sounds good" strongly indicate "positive".
5. Auto-replies, out-of-office messages, or purely logistical responses should be "neutral".
6. When in doubt between positive and neutral, lean towards "positive" if there is any sign of engagement.

Examples:
Input: "Thanks for reaching out! I'd love to learn more about your product."
Output: {"sentiment": "positive"}

Input: "Please remove me from your mailing list."
Output: {"sentiment": "negative"}

Input: "I'm currently out of the office until March 20th."
Output: {"sentiment": "neutral"}

Input: "What pricing plans do you offer?"
Output: {"sentiment": "positive"}

Input: "We are not looking for this kind of solution right now."
Output: {"sentiment": "negative"}

Input: "Can you send me a brochure?"
Output: {"sentiment": "positive"}

Input: "No thanks, we already have a vendor for this."
Output: {"sentiment": "negative"}
`;

async function getEmailReplySentiment(replyText: string, emailMessages: any[]): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-chat-latest",
    messages: [
      { role: "system", content: analyzeEmailReplySentiment },
      { role: "user", content: `Email Reply: ${replyText}\nConversation Thread: ${JSON.stringify(emailMessages)}` }
    ],
    max_completion_tokens: 100,
    response_format: { type: "json_object" }
  });

  const messageContent = response.choices[0]?.message?.content;
  return messageContent ? messageContent.trim() : '{}';
}



async function extractData(message: string,prompt:string, variables: string,filledIntents:string,context:any,isIntentUpdated:boolean): Promise<any> {

  const response = await openai.chat.completions.create({
    model: 'gpt-5-chat-latest',
    messages: [
      { role: 'system', content: extractDataPrompt },
      { role: 'user', content: `Message: ${message}\nRules : ${prompt}\nVariables: ${variables}\nIntents : ${filledIntents}\n Chat Context : ${JSON.stringify(context)}\n is_intent_updated : ${isIntentUpdated}` }
    ],
    max_completion_tokens: 300,
    // temperature: 0.3,
    response_format: { type: "json_object" }
  });


  const messageContent=response.choices[0]?.message?.content;

  //saving data for fine tuning
  const input=`"prompt" : ${extractDataPrompt}. User says : Message: ${message}\nRules : ${prompt}\nVariables: ${variables}\nIntents : ${filledIntents}\n Chat Context : ${JSON.stringify(context)}\n is_intent_updated : ${isIntentUpdated} `;
  const output = `"completion" : ${messageContent} `;


  return messageContent ? messageContent.trim() : '{}';
}






async function decideNextNode(decisionNodes : string,intents:string) {

  console.log("inside decision bot");
  console.log(decisionNodes);
  console.log(intents);
  const response = await openai.chat.completions.create({
      model: 'gpt-5-chat-latest',
      messages: [
        { role: 'system', content: decisionPrompt },
        { role: 'user', content: `Decisions : ${decisionNodes}\nIntents : ${intents}` }
      ],
      max_completion_tokens: 300,
      // temperature: 0.3,
      response_format: { type: "json_object" }
    });
  
    const messageContent=response.choices[0]?.message?.content;

    console.log("------------------------------DECIDED BY BOT-----------------------------")
    console.log(messageContent);
    return messageContent ? messageContent.trim() : '{}';
}






async function getUserSentiment(context:any,intents:string,variables:string=''):Promise<string>{
  
  const response=await openai.chat.completions.create({
    model:"gpt-5-chat-latest",
    messages:[
      {role :"system",content : analyzeUserSentiment },
      {role : "user" , content:`Context : ${JSON.stringify(context)}\n Intents : ${intents} \n Variables : ${variables}`}
    ],
    max_completion_tokens:300,
    // temperature : 0.3,
    response_format:{type:"json_object"}
  });

  const messageContent=response.choices[0]?.message?.content;

 
  return messageContent ? messageContent.trim() : '{}';
}

async function getMetaMessage(message:string,context:string):Promise<string>{

      
   const response=await openai.chat.completions.create({
      model:"gpt-5-chat-latest",
      messages:[
      {role :"system",content : giveMetaMessagePrompt },
      {role : "user" , content:`Message : ${message}\n Context : ${context}\n`}
      ],
      max_completion_tokens:300,
      // temperature : 0.3,
      response_format:{type:"json_object"}
   });

   const messageContent=response.choices[0]?.message?.content;

   console.log(messageContent);
  return messageContent ? messageContent.trim() : '{}';
   
}



export {extractData  , decideNextNode , getUserSentiment,getMetaMessage, getEmailReplySentiment }
