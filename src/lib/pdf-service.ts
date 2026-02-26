import puppeteer from 'puppeteer';
import puppeteerCore from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { storageService } from './cloud-storage-service';
import dotenv from 'dotenv';
import sharp from 'sharp';
import axios from 'axios';

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

async function optimizeImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
}

/**
 * Extracts the filename from a Supabase storage URL.
 * Example: https://olmuwydjqvknnbjqdnak.supabase.co/storage/v1/object/public/poc-digestaid/img-1772118011209.png
 */
function getFileNameFromUrl(url: string): string | null {
    try {
        const parts = url.split('/');
        return parts[parts.length - 1] || null;
    } catch {
        return null;
    }
}

export async function generatePdf({ imageBuffers, imageUrls, jobId = Date.now().toString() }: GeneratePdfOptions): Promise<GeneratePdfResult | void> {
    console.log('[generatePdf]: ', { imageBuffersCount: imageBuffers?.length, imageUrlsCount: imageUrls?.length, jobId });
    const startTime = Date.now();

    try {
        const optimizedImageBase64s: string[] = [];

        if (imageBuffers && imageBuffers.length > 0) {
            console.log(`[generatePdf] Optimizing ${imageBuffers.length} provided buffers...`);
            const optimizedBuffers = await Promise.all(
                imageBuffers.map(buffer => optimizeImage(buffer))
            );
            optimizedImageBase64s.push(...optimizedBuffers.map(b => b.toString('base64')));
        }

        if (imageUrls && imageUrls.length > 0) {
            console.log(`[generatePdf] Processing ${imageUrls.length} image URLs...`);
            const fetchedAndOptimized = await Promise.all(
                imageUrls.map(async (url) => {
                    try {
                        let buffer: Buffer;

                        const fileName = getFileNameFromUrl(url);
                        if (fileName && fileName.startsWith('img-')) {
                            console.log(`[generatePdf] Reading ${fileName} directly from storage...`);
                            buffer = await storageService.readFile(fileName);
                        } else {
                            console.log(`[generatePdf] Fetching ${url} via HTTP...`);
                            const { data: arrayBuffer } = await axios.get(url, { responseType: 'arraybuffer' });
                            buffer = Buffer.from(arrayBuffer);
                        }

                        const optimized = await optimizeImage(buffer);
                        return optimized.toString('base64');
                    } catch (err) {
                        console.error(`[generatePdf] Error processing image ${url}:`, err);
                        return null;
                    }
                })
            );
            optimizedImageBase64s.push(...fetchedAndOptimized.filter((b): b is string => b !== null));
        }

        if (optimizedImageBase64s.length === 0) {
            throw new Error('Could not process any images for the PDF. Check if the images were uploaded correctly.');
        }

        console.log(`[generatePdf] Total optimized images for HTML: ${optimizedImageBase64s.length}`);

        const imagesHtml = optimizedImageBase64s
            .map(base64 => `
                <div style="width: 100%; display: flex; justify-content: space-between; gap: 20px;">
                    <img src="data:image/jpeg;base64,${base64}" alt="Imagem do relatório" style="width: 49%; height: auto; border: 1px solid #ddd;"/>
                </div>
            `)
            .join('');

        let browser;

        console.log(`[generatePdf] Launching browser (Mode: ${process.env.NODE_ENV})...`);
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
            browser = await puppeteerCore.launch({
                args: chromium.args,
                executablePath: await chromium.executablePath(),
                headless: true,
            });
        } else {
            browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                headless: true,
                executablePath: await chromium.executablePath(),
            });
        }

        const page = await browser.newPage();
        console.log(`[generatePdf] Page opened, setting content...`);

        const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; background: white; color: #1e293b; }
            h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 30px; }
            .meta { color: #64748b; font-size: 14px; margin-bottom: 40px; border-left: 4px solid #3b82f6; padding-left: 15px; }
            img { max-width: 100%; height: auto; display: block; page-break-inside: avoid; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
            .grid { display: flex; flex-direction: column; gap: 30px; }
            .footer { margin-top: 50px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #f1f5f9; padding-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Relatório Digital de Obra</h1>
          
          <div class="meta">
            <p><strong>Gerado em:</strong> ${new Date().toLocaleString('pt-PT')}</p>
            <p><strong>Total de Registos:</strong> ${optimizedImageBase64s.length}</p>
            <p><strong>Código do Trabalho:</strong> ${jobId}</p>
            <p>Este documento é uma cópia digital fiel das observações recolhidas no local.</p>
          </div>

          <div style="page-break-after: always;"></div>
          
          <div class="grid">
            ${imagesHtml}
          </div>

          <div class="footer">
            <p>© ${new Date().getFullYear()} PDF Generator Pro - Processamento Serverless Otimizado</p>
          </div>
        </body>
      </html>
    `;

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        console.log(`[generatePdf] Rendering PDF buffer...`);

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '30px', bottom: '30px', left: '30px', right: '30px' }
        });

        await browser.close();

        const fileName = `pdf-${jobId}-${Date.now()}.pdf`;
        console.log(`[generatePdf] Uploading ${fileName} to storage...`);
        const publicUrl = await storageService.upload(Buffer.from(pdfBuffer), fileName, 'application/pdf');

        const duration = Date.now() - startTime;
        console.log(`[generatePdf] Job ${jobId} finished in ${duration}ms`);

        return {
            pdfUrl: publicUrl,
            executionTime: `${duration}ms`,
        };
    } catch (error) {
        console.error('[generatePdf] CRITICAL FAILURE:', error);
        throw error;
    }
}
