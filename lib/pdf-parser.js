/**
 * PDF 文本提取模块
 * 使用 pdf.js 从 PDF 文件中提取文本内容
 */

const PDF_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs';
const PDF_JS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';

let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(PDF_JS_CDN);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_CDN;
  return pdfjsLib;
}

/**
 * 从 PDF 文件中提取全部文本
 * @param {ArrayBuffer} pdfData - PDF 文件的 ArrayBuffer
 * @returns {Promise<string>} 提取的文本内容
 */
export async function extractTextFromPDF(pdfData) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
  const textParts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n');
}

/**
 * 从 File 对象中提取 PDF 文本
 * @param {File} file - PDF 文件对象
 * @returns {Promise<string>}
 */
export async function extractTextFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  return extractTextFromPDF(arrayBuffer);
}
