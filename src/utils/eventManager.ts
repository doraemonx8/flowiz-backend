type Client = {
    userId: string | any;
    res: any;
    companyId:string | any
  };

type webClient ={

  flowId : string;
  domain:string;
  res: any;
}
  
  const clients: Client[] = [];

  const webClients : webClient[]=[]; 
  
  export function addClient(userId: string | any,companyId:string | any, res: any) {
    const newClient = { userId, res ,companyId};
    clients.push(newClient);

    console.log("clients =>",clients.length);
  }
  
  export function removeClient(res: any) {
    const index = clients.findIndex(client => client.res === res);
    if (index !== -1) clients.splice(index, 1);
  }
  
  export function sendMessageToAgent(companyId: string | any, data: any) {
    clients.forEach(client => {
      console.log("company id =>",client.companyId);
      if (client.companyId == companyId) {
        console.log("found client sending data");
        client.res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    });
  }

export const addWebClient=(flowId:string,domain:string,res:any)=>{

  const newClient={flowId,domain,res};

  webClients.push(newClient);


}


export const removeWebClient=(res:any)=>{

  const index = webClients.findIndex(client => client.res === res);

  if(index!==-1) webClients.splice(index,1);
}


export const sendMessageToWebUser=(flowId:string,data:any)=>{


  webClients.forEach(client =>{

    if(client.flowId==flowId){

      console.log("found client",client);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  })
}
  