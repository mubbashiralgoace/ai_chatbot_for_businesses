import mammoth from 'mammoth';

export interface ProcessedDocument {
  text: string;
  fileName: string;
  fileType: string;
}

// Split text into chunks for better vector search
export function splitTextIntoChunks(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    // Try to break at sentence boundaries
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > chunkSize * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1);
        start += breakPoint + 1;
      } else {
        start = end - overlap;
      }
    } else {
      start = end;
    }

    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }

  return chunks;
}

// Process PDF file - try multiple methods with fallbacks
export async function processPDF(buffer: Buffer, fileName: string): Promise<ProcessedDocument> {
  // Try method 1: pdf-parse (most reliable)
  try {
    return await processPDFWithPDFParse(buffer, fileName);
  } catch (error1) {
    console.log('pdf-parse failed, trying pdf2json:', error1 instanceof Error ? error1.message : 'Unknown error');
    
    // Try method 2: pdf2json
    try {
      return await processPDFWithPDF2JSON(buffer, fileName);
    } catch (error2) {
      console.log('pdf2json failed, trying pdfjs-dist:', error2 instanceof Error ? error2.message : 'Unknown error');
      
      // Try method 3: pdfjs-dist
      try {
        return await processPDFWithPDFJSDist(buffer, fileName);
      } catch (error3) {
        console.error('All PDF extraction methods failed');
        throw new Error(`Failed to extract text from PDF. Tried 3 different methods. The PDF may be image-based, encrypted, or corrupted. Last error: ${error3 instanceof Error ? error3.message : 'Unknown error'}`);
      }
    }
  }
}

// Method 1: Using pdf-parse
async function processPDFWithPDFParse(buffer: Buffer, fileName: string): Promise<ProcessedDocument> {
  const { PDFParse } = await import('pdf-parse');
  const uint8Array = new Uint8Array(buffer);
  
  const pdfParse = new PDFParse({ 
    data: uint8Array,
    verbosity: 0,
  });
  
  const textResult = await pdfParse.getText();
  await pdfParse.destroy();
  
  const text = textResult.text || '';
  
  if (!text || text.trim().length === 0) {
    throw new Error('pdf-parse extracted empty text');
  }
  
  console.log(`pdf-parse extracted ${text.length} characters from ${fileName}`);
  
  return {
    text: text.trim(),
    fileName,
    fileType: 'pdf',
  };
}

// Method 2: Using pdf2json
interface PDF2JSONTextItem {
  R?: Array<{ T?: string }>;
}

interface PDF2JSONPage {
  Texts?: PDF2JSONTextItem[];
}

interface PDF2JSONData {
  Pages?: PDF2JSONPage[];
}

async function processPDFWithPDF2JSON(buffer: Buffer, fileName: string): Promise<ProcessedDocument> {
  const PDFParserModule = await import('pdf2json');
  const PDFParser = PDFParserModule.default || PDFParserModule;
  
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    const timeout = setTimeout(() => {
      reject(new Error('pdf2json parsing timeout'));
    }, 30000);
    
    pdfParser.on('pdfParser_dataError', (errData: Error | { parserError: Error }) => {
      clearTimeout(timeout);
      const errorMessage = errData instanceof Error 
        ? errData.message 
        : errData.parserError?.message || JSON.stringify(errData);
      reject(new Error(`pdf2json error: ${errorMessage}`));
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData: PDF2JSONData) => {
      clearTimeout(timeout);
      try {
        let text = '';
        
        if (pdfParser.getRawTextContent) {
          text = pdfParser.getRawTextContent() || '';
        }
        
        if (!text && pdfData && pdfData.Pages) {
          text = pdfData.Pages
            .map((page: PDF2JSONPage) => {
              if (page.Texts) {
                return page.Texts
                  .map((textItem: PDF2JSONTextItem) => {
                    if (textItem.R) {
                      return textItem.R
                        .map((r) => {
                          if (r.T) {
                            try {
                              return decodeURIComponent(r.T);
                            } catch {
                              return r.T;
                            }
                          }
                          return '';
                        })
                        .join('');
                    }
                    return '';
                  })
                  .join(' ');
              }
              return '';
            })
            .join('\n');
        }
        
        if (!text || text.trim().length === 0) {
          reject(new Error('pdf2json extracted empty text'));
          return;
        }
        
        console.log(`pdf2json extracted ${text.length} characters from ${fileName}`);
        resolve({
          text: text.trim(),
          fileName,
          fileType: 'pdf',
        });
      } catch (error) {
        reject(new Error(`pdf2json extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
    
    try {
      pdfParser.parseBuffer(buffer);
    } catch (parseError) {
      clearTimeout(timeout);
      reject(new Error(`pdf2json parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
    }
  });
}

// Method 3: Using pdfjs-dist
async function processPDFWithPDFJSDist(buffer: Buffer, fileName: string): Promise<ProcessedDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  // Disable worker
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = '';
  }
  
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => {
        // Check if item has 'str' property (TextItem) vs TextMarkedContent
        if ('str' in item && typeof item.str === 'string') {
          return item.str;
        }
        return '';
      })
      .join(' ');
    fullText += pageText + '\n';
  }
  
  if (!fullText || fullText.trim().length === 0) {
    throw new Error('pdfjs-dist extracted empty text');
  }
  
  console.log(`pdfjs-dist extracted ${fullText.length} characters from ${fileName}`);
  
  return {
    text: fullText.trim(),
    fileName,
    fileType: 'pdf',
  };
}

// Process Word document
export async function processWord(buffer: Buffer, fileName: string): Promise<ProcessedDocument> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      fileName,
      fileType: 'docx',
    };
  } catch (error) {
    throw new Error(`Failed to process Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Process text file
export async function processText(buffer: Buffer, fileName: string): Promise<ProcessedDocument> {
  try {
    const text = buffer.toString('utf-8');
    return {
      text,
      fileName,
      fileType: 'txt',
    };
  } catch (error) {
    throw new Error(`Failed to process text file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Main document processor
export async function processDocument(
  file: File
): Promise<{ chunks: string[]; fileName: string; fileType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;
  const fileExtension = fileName.split('.').pop()?.toLowerCase();

  let processed: ProcessedDocument;

  switch (fileExtension) {
    case 'pdf':
      processed = await processPDF(buffer, fileName);
      break;
    case 'docx':
    case 'doc':
      processed = await processWord(buffer, fileName);
      break;
    case 'txt':
      processed = await processText(buffer, fileName);
      break;
    default:
      throw new Error(`Unsupported file type: ${fileExtension}`);
  }

  const chunks = splitTextIntoChunks(processed.text);
  
  return {
    chunks,
    fileName: processed.fileName,
    fileType: processed.fileType,
  };
}

