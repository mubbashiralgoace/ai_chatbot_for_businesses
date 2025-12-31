import { NextResponse } from 'next/server';
import { supabaseVectorStore } from '@/lib/supabase-vector-store';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
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

    const documents = await supabaseVectorStore.getAllDocuments(user.id);
    
    // Get unique file names
    const fileNames = Array.from(
      new Set(documents.map(doc => doc.metadata.fileName))
    );

    const documentInfo = fileNames.map(fileName => {
      const fileDocs = documents.filter(doc => doc.metadata.fileName === fileName);
      return {
        fileName,
        chunks: fileDocs.length,
        uploadedAt: fileDocs[0]?.metadata.timestamp,
      };
    });

    return NextResponse.json({
      documents: documentInfo,
      totalChunks: documents.length,
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
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

    await supabaseVectorStore.clear(user.id);
    return NextResponse.json({ 
      message: 'All documents cleared successfully',
      success: true 
    });
  } catch (error) {
    console.error('Error clearing documents:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to clear documents',
        success: false 
      },
      { status: 500 }
    );
  }
}

