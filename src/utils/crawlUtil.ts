import axios from "axios";
import { load } from "cheerio";
import {verifyEmailAddress} from "./emailUtil";

const getEmailFromURL=async(url:string,crawlDepth:string)=>{

    try{
        
        const res = await axios.get(url,{timeout:5000});
        
        if (res.status < 200 || res.status >= 300) {
        
            throw new Error(`Failed to fetch: ${url} ${res.status} ${res.statusText}`);
        }

        const html = res.data;
        console.log("CONSOLE HTML=>",html)
        const $ = load(html);
    
        const results: string[] = [];

        const infoMails : string[]=[];
        const nonInfoMails : string[]=[];
    
        $("a[href^='mailto:']").each((_, el) => {
            const email = $(el).attr("href")?.replace("mailto:", "").trim();

            if (email) results.push(email);

        });
    
        $("*").each((_, el) => {
            const text = $(el).text().trim();
            if (!text) return;
    
            const emailRegex =
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const matches = text.match(emailRegex);
    
            if (matches) {
            results.push(...matches);
            }
        });
    
        const uniqueEmails = [...new Set(results)];

        if((url.includes("about") || url.includes("team")) && crawlDepth=="3"){
            const text = $("body").text();
            const emails=await getNameEmail(text,url);
            uniqueEmails.push(...emails);
        }
        //check for info & non-info mails

        uniqueEmails.forEach((email)=>{

            if (email.split("@")[0].includes("info")) infoMails.push(email);
            else nonInfoMails.push(email);
        });

        
        console.log(`Info mails for url - ${url}  => `,infoMails);
        console.log(`Non info mails => `,nonInfoMails);
        return nonInfoMails.length > 0 ? nonInfoMails[0] : infoMails[0];

    }catch(err){

    }
}



//generate possible email formats
const generateEmails = (name: string, domain: string): string[] => {
  const [first, last] = name.toLowerCase().split(" ");
  const emails: string[] = [];

  if (first && last) {
    emails.push(`${first}.${last}@${domain}`);
    emails.push(`${first}${last}@${domain}`);
    emails.push(`${first[0]}${last}@${domain}`);
    emails.push(`${first}${last[0]}@${domain}`);
  }
  if (first) {
    emails.push(`${first}@${domain}`);
    emails.push(`${first[0]}@${domain}`);
  }
  return Array.from(new Set(emails)); // unique
};

const getNameEmail = async (text: string, domainUrl: string) => {
  try {
    const res = await axios.post(
      "https://cybernauts.online/aqua/get-names",
      { text },
      { headers: { "Content-Type": "application/json" } }
    );

    const names: string[] = res.data.unique_names || [];

    const domain = new URL(domainUrl).hostname.replace(/^www\./, "");

    const allEmails = names.flatMap((name) => generateEmails(name, domain));

    const validEmails=[];

    for (const email in allEmails){

        if(await verifyEmailAddress(email)){
            validEmails.push(email);
        }
    }
    return validEmails;
  } catch (err) {
    console.error(err);
    return [];
  }
};


export {getEmailFromURL};