import { NextRequest, NextResponse } from 'next/server';
import { processDocument } from '@/lib/document-processor';
import { generateEmbeddings } from '@/lib/embeddings';
import { supabaseVectorStore } from '@/lib/supabase-vector-store';
import { createServerSupabaseClient } from '@/lib/supabase-server';

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

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Process the document
    let processedResult;
    try {
      processedResult = await processDocument(file);
    } catch (processError) {
      console.error('Document processing error:', processError);
      return NextResponse.json(
        { 
          error: `Failed to process document: ${processError instanceof Error ? processError.message : 'Unknown error'}`,
          details: processError instanceof Error ? processError.stack : undefined
        },
        { status: 400 }
      );
    }

    const { chunks, fileName, fileType } = processedResult;

    console.log(`Processed document: ${fileName}, Type: ${fileType}, Chunks: ${chunks.length}`);
    
    if (chunks.length === 0) {
      console.warn(`Document ${fileName} resulted in 0 chunks. Text length: ${processedResult.chunks.join('').length}`);
      return NextResponse.json(
        { 
          error: 'Document is empty or could not be processed',
          details: `No text could be extracted from the document. Please ensure the document contains readable text.`
        },
        { status: 400 }
      );
    }

    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(chunks);

    // Store in vector database
    const documentChunks = chunks.map((chunk, index) => ({
      text: chunk,
      embedding: embeddings[index],
      metadata: {
        fileName,
        chunkIndex: index,
        timestamp: new Date(),
      },
    }));

    const ids = await supabaseVectorStore.addDocuments(documentChunks, user.id);

    return NextResponse.json({
      success: true,
      message: 'Document uploaded and processed successfully',
      fileName,
      fileType,
      chunksProcessed: chunks.length,
      documentIds: ids,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process document',
      },
      { status: 500 }
    );
  }
}

