type EmailNode = {
    id: string;
    type: string;
    data: {
      subject?: string;
      body?: string;
      hourDelay?: string; 
      minDelay?: string;
      secDelay?:string;
      isFirst: boolean;
      isLast: boolean;
    };
    next: string[] | null;
  };

function buildEmailSequence(nodes: EmailNode[],leadName:string) {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const sequence: any[] = [];
  
    let current: EmailNode | undefined = nodes.find((node) => node.data.isFirst);

    let lastDelay: any = null;

    let hourDelay=0;
    let minDelay=0;
    let count=0;

    while (current) {
      const { data, next,type,id } = current;
  
      if (type==="delayNode") {

        lastDelay = {hours:data.hourDelay,mins:data.minDelay};
        hourDelay+=parseInt(data?.hourDelay as string);
        minDelay+=parseInt(data?.minDelay as string);
      } else if (data.subject && data.body) {

        hourDelay+= count===0 ? 0 : 24;  //default 24.5 hour delay
        minDelay+=count===0 ? 0 : 30

        // const name=leadName ? leadName.split(" ")[0] : "";
        const email = {
          id,
          subject: data.subject.replaceAll("{{name}}",leadName),
          body: data.body.replaceAll("{{name}}",leadName),
          ...(lastDelay ? { delay: {hours:hourDelay,mins:minDelay} } : {delay : {hours : hourDelay,mins:minDelay}}),
        };
        sequence.push(email);
        lastDelay = null;
      }

        count+=1;
        const nextId = next && next.length > 0 ? next[0] : undefined;
        current = nextId ? nodeMap.get(nextId) : undefined;

    }
  
    return sequence;
  }
const createEmailJobsDataFromFlow=(subFlow:any,leadName:string)=>{

    try{

        const isJsonData=subFlow.json && (!subFlow.flowData || !subFlow.flowData.length);

        //if json data then loop over it to create email jobs
        if(isJsonData){

            let hourDelay=0;
            let minDelay=0;
            const data = subFlow.json.map((item: any, index: number) => {
                //skip if delay
                if ('delay' in item && !('subject' in item)) {
                  return null;
                }
              

                const prevItem = subFlow.json[index - 1];
                const hasPrevDelay = prevItem && 'delay' in prevItem;

                if(hasPrevDelay){
                  hourDelay+=parseInt(prevItem.delay.hours);
                  minDelay+=parseInt(prevItem.delay.mins);
                }else{
                  hourDelay+= index===0 ? 0 : 24;  //default 24.5 hour delay
                  minDelay+=index===0 ? 0 : 30
                }

                return {
                  id:index,
                  subject: item.subject.replaceAll("{{name}}",leadName),
                  body: item.body.replaceAll("{{name}}",leadName),
                  ...(hasPrevDelay ? { delay: {hours:hourDelay, mins:minDelay } } : {delay :{hours:hourDelay,mins:minDelay}}),
                };
              }).filter(Boolean);
            
              return data;
        }else{

            const data=buildEmailSequence(subFlow.flowData,leadName);

            return data;
        }
    }catch(err){

        console.error("An error occured while creating emails jobs : ",err);
        return [];
    }
}

const createJobsFromFlow=(flow:any)=>{

  try{

    let hourDelay=0;
    let minDelay=0;

    return flow.data.map((node : any)=>{

      if(node.type=="delay"){
        hourDelay+=node.hours;
        minDelay+=node.mins;
      }else if (node.type==="email"){
        return {
          id:node.id,
          subject:node.subject,
          body:node.body,
          delay : {hours:hourDelay,mins:minDelay}
        }
      }
    });


  }catch(err){

    console.error("an error occured while creating whatsapp jobs",err);
    return [];
  }
}





export {createEmailJobsDataFromFlow,createJobsFromFlow}
