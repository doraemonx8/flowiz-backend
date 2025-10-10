
const GOOGLE_PLACES_API_KEY='AIzaSyAd1ze5NC1HDpcfzyIH4NXgPyiSuFDZ0Dg';

const GOOGLE_PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
import { saveLeads, updateCrawl } from "../models/leadModel";
import { getEmailFromURL } from "./crawlUtil";

interface PlaceSearchResponse {
    status: string;
    results: { place_id: string }[];
    next_page_token?: string;
    error_message?: string;
}

interface PlaceDetailsResponse {
    result: {
        formatted_phone_number?: string;
        website?: string;
        email?: string;
        types?:string
    };
    status: string;
    error_message?: string;
}


const pathsToCheck=['about','about-us','contact','contact-us','team','teams'];

async function getEmailFromWebsite(url: string,crawlDepth:string) {
  try {
    if (!url) {
      console.log("No URL given");
      return null;
    }

    if (!url.endsWith("/")) {
      url = url + "/";
    }

    //checking for different url combinations
    for (const path of pathsToCheck) {
    const fullUrl = url + path;
    const email = await getEmailFromURL(fullUrl,crawlDepth);
    if (email) {
      return email; 
    }


    //if no email found on any page then fall back to puppeteer
    return null;
   
  }
  } catch (err: any) {
    if (err.code === "ECONNABORTED") {
      console.error("Request timed out while fetching:", url);
    } else {
      console.error(
        "An error occurred while getting email from website:",
        err.message
      );
    }
    return undefined;
  }
}



async function fetchPlaceDetails(placeId: string) {
    const url = `${GOOGLE_PLACE_DETAILS_URL}?place_id=${placeId}&fields=formatted_phone_number,website,types&key=${GOOGLE_PLACES_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data: PlaceDetailsResponse = await response.json();
    return data.result;
}

async function fetchAllPlaces(query: string,token:string | null=null, maxResults = 50) {
    if (!GOOGLE_PLACES_API_KEY) {
        throw new Error("Missing Google Places API Key");
    }

    let places: { place_id: string }[] = [];
    let nextPageToken: string | undefined | null =token;
    let url = `${GOOGLE_PLACES_API_URL}?query=${encodeURIComponent(query)}&region=in&key=${GOOGLE_PLACES_API_KEY}${nextPageToken ? `&pagetoken=${nextPageToken}` :""}`; //region can be changed for biased responses

    do {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data: PlaceSearchResponse = await response.json();

        places = places.concat(data.results);
        nextPageToken = data.next_page_token;

        if (nextPageToken) {
            console.log("crawling from google next page");
            await new Promise(resolve => setTimeout(resolve, 1000)); // Google requires a delay before using next_page_token
            url = `${GOOGLE_PLACES_API_URL}?query=${encodeURIComponent(query)}&region=in&key=${GOOGLE_PLACES_API_KEY}&pagetoken=${nextPageToken}`;
        }
    } while (nextPageToken && places.length < maxResults);

    return {places:places.slice(0, maxResults),nextPageToken};
}




const crawlEmails=async(keywords : string,companyId:string,userId:string,crawlDepth:string,pageToken:string | null=null)=>{

  let token=null;
  try{


    const {places,nextPageToken} = await fetchAllPlaces(keywords,pageToken, 50);
    token=nextPageToken;
      const pendingUrls : Array<string>=[]; //urls for which emails could not be found
      let placeDetails : any = await Promise.all(
          places.map(async (place) => {
              const details = await fetchPlaceDetails(place.place_id);

              const websiteEmail= details.website ? await getEmailFromWebsite(details.website as string,crawlDepth) : "";

              if(websiteEmail===null && details.website){
                  pendingUrls.push(details.website);
              }


              return {
                  phone: details.formatted_phone_number || "N/A",
                  website: details.website || "N/A",
                  email: websiteEmail,
                  type:details.types
              };
          })
      );
        
        console.log("total pending urls =>",pendingUrls.length);

        //getting emails from crawler
        if(pendingUrls.length){

            try{

                const emailsResult = await fetch("https://ai.nextclm.in/cb/crawl-emails", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ urls: pendingUrls })
                });

            if(!emailsResult.ok){

                //skip
                console.log("email result not ok");
            }


            const emails=await emailsResult.json();
            
            let count=0;
            emails.data.forEach((emailData : any)=>{

                const url=Object.keys(emailData)[0];
                const urlEmails=emailData[url];

                placeDetails = placeDetails.map((place: any) => {
                    if (place.website === url && urlEmails.length) {
                        count += 1;
                        return { ...place, email: urlEmails[0] };
                    }
                    return place; 
                });


            });

            console.log("total emails from crawler => ",count);
            }catch(err : any){

                console.error(err.message);
            }
           
        };
        //saving leads
        await saveLeads(placeDetails,companyId,keywords,userId);

        console.log(`Crawl completed & saved for : ${keywords}`);  
        
  }catch(err:any){
    console.error(err.message);

    
  }finally{

    //update crawl table for status
    await updateCrawl(userId,'1',keywords,token as string);
  }
  
}


export {fetchAllPlaces,fetchPlaceDetails,getEmailFromWebsite,crawlEmails};