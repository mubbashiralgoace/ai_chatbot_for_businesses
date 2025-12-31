import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || 'AIzaSyDWoqAV-XSpmUYBfJYOudkEC6cdj5hn3Bg'
);

// Generate embeddings for text using Gemini
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Use Gemini's embedding model
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    const result = await model.embedContent(text);
    
    // Check the result structure
    if (result.embedding) {
      // If embedding is directly available
      if (Array.isArray(result.embedding)) {
        return result.embedding;
      }
      if (result.embedding.values) {
        return result.embedding.values;
      }
    }
    
    // Try alternative structure
    interface EmbeddingResult {
      embedding?: {
        values?: number[];
      };
    }
    const altResult = result as EmbeddingResult;
    if (altResult.embedding?.values) {
      return altResult.embedding.values;
    }
    
    throw new Error('No embedding returned from Gemini - unexpected response structure');
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate embeddings for multiple texts
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    // Process embeddings in parallel (with rate limiting consideration)
    const embeddingPromises = texts.map(text => model.embedContent(text));
    const results = await Promise.all(embeddingPromises);
    
    return results.map(result => {
      if (result.embedding) {
        if (Array.isArray(result.embedding)) {
          return result.embedding;
        }
        if (result.embedding.values) {
          return result.embedding.values;
        }
      }
      interface EmbeddingResult {
        embedding?: {
          values?: number[];
        };
      }
      const altResult = result as EmbeddingResult;
      if (altResult.embedding?.values) {
        return altResult.embedding.values;
      }
      throw new Error('No embedding returned from Gemini');
    });
  } catch (error) {
    console.error('Error generating embeddings:', error);
    throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

