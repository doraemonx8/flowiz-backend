import { pinecone,embeddings } from '../config/pinecone';

const getFaqContext=async(query : string,namespace:string,flowId:string)=>{


      try{

        const queryEmbeddingVector = await embeddings.embedQuery(query || 'null')
    
    
        const index = pinecone.Index('flowiz');
      
        const queryRequest = {
          vector: queryEmbeddingVector,
          topK: 1,
          filter: { flowId: flowId },
          includeValues: true,
          includeMetadata: true,
        }
        const result = await index.namespace(namespace.toString()).query(queryRequest)

        let context='';
        result.matches.map((match: any) => {
          if (match.metadata.text !== undefined) {
            context += ` ${match.metadata.text} `
          }
        })
      
        return context
      }catch(err){
        console.error(err);
        return "";
      }
    
      

}


export {getFaqContext};