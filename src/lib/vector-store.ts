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

// Simple in-memory vector store with cosine similarity
export class VectorStore {
  private documents: DocumentChunk[] = [];

  // Add document chunks to the store
  addDocuments(chunks: Omit<DocumentChunk, 'id'>[]): string[] {
    const ids: string[] = [];
    for (const chunk of chunks) {
      const id = uuidv4();
      this.documents.push({ ...chunk, id });
      ids.push(id);
    }
    return ids;
  }

  // Calculate cosine similarity between two vectors
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

  // Search for similar documents
  search(queryEmbedding: number[], topK: number = 5): DocumentChunk[] {
    const similarities = this.documents.map(doc => ({
      document: doc,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    // Sort by similarity (descending) and return top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities
      .slice(0, topK)
      .filter(item => item.similarity > 0.5) // Only return relevant results
      .map(item => item.document);
  }

  // Get all documents
  getAllDocuments(): DocumentChunk[] {
    return this.documents;
  }

  // Clear all documents
  clear(): void {
    this.documents = [];
  }

  // Get document count
  getCount(): number {
    return this.documents.length;
  }
}

// Singleton instance
export const vectorStore = new VectorStore();

