import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';

export interface DocumentChunk {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    fileName: string;
    chunkIndex: number;
    timestamp: Date;
  };
}

// Supabase vector store using pgvector
export class SupabaseVectorStore {
  private tableName = 'document_chunks';

  // Add document chunks to Supabase
  async addDocuments(chunks: Omit<DocumentChunk, 'id'>[], userId: string): Promise<string[]> {
    const ids: string[] = [];
    
    for (const chunk of chunks) {
      const id = uuidv4();
      
      // Insert into Supabase with vector embedding and user_id
      const { error } = await supabase
        .from(this.tableName)
        .insert({
          id,
          text: chunk.text,
          embedding: chunk.embedding, // pgvector will handle this
          file_name: chunk.metadata.fileName,
          chunk_index: chunk.metadata.chunkIndex,
          created_at: chunk.metadata.timestamp.toISOString(),
          user_id: userId,
        });

      if (error) {
        console.error('Error inserting document chunk:', error);
        throw new Error(`Failed to insert document chunk: ${error.message}`);
      }

      ids.push(id);
    }

    return ids;
  }

  // Search for similar documents using pgvector cosine similarity
  async search(queryEmbedding: number[], topK: number = 5, userId: string): Promise<DocumentChunk[]> {
    try {
      // Use pgvector's cosine similarity operator
      // The embedding column should be of type vector(1536) or your embedding dimension
      const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: topK,
      });

      if (error) {
        // If RPC function doesn't exist, use direct query with cosine distance
        return await this.searchWithDirectQuery(queryEmbedding, topK, userId);
      }

      // Map the results to DocumentChunk format and filter by user_id
      interface SupabaseRow {
        id: string;
        text: string;
        embedding: number[];
        file_name: string;
        chunk_index: number;
        created_at: string;
        user_id: string;
      }
      return (data || [])
        .filter((row: SupabaseRow) => row.user_id === userId)
        .map((row: SupabaseRow) => ({
          id: row.id,
          text: row.text,
          embedding: row.embedding,
          metadata: {
            fileName: row.file_name,
            chunkIndex: row.chunk_index,
            timestamp: new Date(row.created_at),
          },
        }));
    } catch (error) {
      console.error('Search error:', error);
      // Fallback to direct query
      return await this.searchWithDirectQuery(queryEmbedding, topK, userId);
    }
  }

  // Fallback search method using direct SQL query
  private async searchWithDirectQuery(queryEmbedding: number[], topK: number, userId: string): Promise<DocumentChunk[]> {
    // Load a reasonable number of documents and calculate similarity in code
    // This is a fallback if RPC function or direct vector queries don't work
    const { data: allData, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .limit(500); // Limit to avoid loading too much

    if (error || !allData) {
      console.error('Error fetching documents for search:', error);
      return [];
    }

    // Calculate cosine similarity in code
    interface SupabaseRow {
      id: string;
      text: string;
      embedding: number[];
      file_name: string;
      chunk_index: number;
      created_at: string;
      user_id: string;
    }
    
    interface SimilarityRow extends SupabaseRow {
      similarity: number;
    }
    
    const similarities = allData.map((row: SupabaseRow) => {
      const similarity = this.cosineSimilarity(queryEmbedding, row.embedding);
      return {
        ...row,
        similarity,
      } as SimilarityRow;
    });

    // Sort by similarity (descending) and filter by threshold
    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities
      .slice(0, topK)
      .filter(item => item.similarity > 0.5)
      .map((row: SimilarityRow) => ({
        id: row.id,
        text: row.text,
        embedding: row.embedding,
        metadata: {
          fileName: row.file_name,
          chunkIndex: row.chunk_index,
          timestamp: new Date(row.created_at),
        },
      }));
  }

  // Calculate cosine similarity
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Get all documents for a specific user
  async getAllDocuments(userId: string): Promise<DocumentChunk[]> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching documents:', error);
      return [];
    }

    interface SupabaseRow {
      id: string;
      text: string;
      embedding: number[];
      file_name: string;
      chunk_index: number;
      created_at: string;
      user_id: string;
    }
    
    return (data || []).map((row: SupabaseRow) => ({
      id: row.id,
      text: row.text,
      embedding: row.embedding,
      metadata: {
        fileName: row.file_name,
        chunkIndex: row.chunk_index,
        timestamp: new Date(row.created_at),
      },
    }));
  }

  // Clear all documents for a specific user
  async clear(userId: string): Promise<void> {
    // Delete all documents for this user
    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error clearing documents:', error);
      throw new Error(`Failed to clear documents: ${error.message}`);
    }
  }

  // Get document count for a specific user
  async getCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      console.error('Error getting count:', error);
      return 0;
    }

    return count || 0;
  }
}

// Singleton instance
export const supabaseVectorStore = new SupabaseVectorStore();

