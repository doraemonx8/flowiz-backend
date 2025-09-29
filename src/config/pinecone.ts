
import { Pinecone } from '@pinecone-database/pinecone';

import { OpenAIEmbeddings } from '@langchain/openai'

const apiKey =process.env.PINECONE_KEY as string;
const pinecone = new Pinecone({ apiKey });


const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model:"text-embedding-3-small"
  })


export {pinecone,embeddings};