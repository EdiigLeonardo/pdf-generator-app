import puppeteer from 'puppeteer';
import { storageService } from './cloud-storage-service';
import dotenv from 'dotenv';

dotenv.config();

export interface GeneratePdfOptions {
    imageBuffers?: Buffer[];
    imageUrls?: string[];
    jobId?: string;
}

export interface GeneratePdfResult {
    pdfUrl: string;
    executionTime: string;
}

export async function generatePdf({ imageBuffers, imageUrls, jobId = Date.now().toString() }: GeneratePdfOptions): Promise<GeneratePdfResult | void> {
    console.log('[generatePdf]: ', { imageBuffers }, { imageUrls }, { jobId });
    const startTime = Date.now();
    console.log(`Generating PDF for job ${jobId}...`);

    try {
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();

        let imagesHtml = '';

        if (imageBuffers && imageBuffers.length > 0) {
            imagesHtml += imageBuffers.map((buffer) => {
                const base64 = buffer.toString('base64');
                return `<img src="data:image/png;base64,${base64}" />`;
            }).join('');
        }

        if (imageUrls && imageUrls.length > 0) {
            imagesHtml += imageUrls.map((url) => {
                return `<img src="${url}" />`;
            }).join('');
        }

        if (!imagesHtml) {
            throw new Error('No images provided for PDF generation');
        }

        const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            img { max-width: 100%; margin-bottom: 20px; display: block; page-break-inside: avoid; }
            h1 { color: #333; }
          </style>
        </head>
        <body>
          <h1>Relatório de Imagens</h1>
          <p>Início do relatório</p>
          <p>Gerado em: ${new Date().toISOString()}</p>
          <p>Quantidade de imagens: ${imageBuffers?.length || imageUrls?.length}</p>
          <p>Request ID: ${jobId}</p>
          <p> Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>
          ${imagesHtml}
          <p> Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.</p>
          <p>Fim do relatório</p>
        </body>
      </html>
    `;

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4' });

        await browser.close();

        const fileName = `pdf-${jobId}-${Date.now()}.pdf`;
        const publicUrl = await storageService.upload(Buffer.from(pdfBuffer), fileName, 'application/pdf');

        const duration = Date.now() - startTime;
        return {
            pdfUrl: publicUrl,
            executionTime: `${duration}ms`,
        };
    } catch (error) {
        console.error('PDF Generation error:', error);
        throw error;
    }
}
