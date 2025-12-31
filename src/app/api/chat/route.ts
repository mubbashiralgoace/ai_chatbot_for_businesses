import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEmbedding } from '@/lib/embeddings';
import { supabaseVectorStore } from '@/lib/supabase-vector-store';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || 'AIzaSyDWoqAV-XSpmUYBfJYOudkEC6cdj5hn3Bg'
);

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Check if vector store has documents for this user
    const documentCount = await supabaseVectorStore.getCount(user.id);
    if (documentCount === 0) {
      return NextResponse.json({
        response: 'Please upload business documents first before asking questions.',
      });
    }

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(message);

    // Search for relevant document chunks for this user
    const relevantDocs = await supabaseVectorStore.search(queryEmbedding, 5, user.id);

    // Build context from relevant documents
    const context = relevantDocs
      .map((doc, index) => `[Document ${index + 1} from ${doc.metadata.fileName}]:\n${doc.text}`)
      .join('\n\n---\n\n');

    // Create prompt with context for Gemini
    const prompt = `You are a helpful AI assistant that answers questions based on the provided business documents. Use only the information from the documents to answer questions. If the answer is not in the documents, say so politely.

Context from documents:
${context}

User Question: ${message}

Answer based on the context above:`;

    // Generate response using Gemini (free model: gemini-1.5-flash)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response.text() || 'Sorry, I could not generate a response.';

    return NextResponse.json({
      response,
      sources: relevantDocs.map(doc => ({
        fileName: doc.metadata.fileName,
        chunkIndex: doc.metadata.chunkIndex,
      })),
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process chat message',
      },
      { status: 500 }
    );
  }
}

