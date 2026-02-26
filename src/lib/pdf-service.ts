import puppeteer from 'puppeteer';
import puppeteerCore from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { storageService } from './cloud-storage-service';
import dotenv from 'dotenv';
import sharp from 'sharp';

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

export async function generatePdf({ imageBuffers, imageUrls, jobId = Date.now().toString() }: GeneratePdfOptions): Promise<GeneratePdfResult | void> {
    console.log('[generatePdf]: ', { imageBuffersCount: imageBuffers?.length, imageUrlsCount: imageUrls?.length, jobId });
    const startTime = Date.now();

    try {
        // Optimize all images in parallel
        const optimizedImageBase64s: string[] = [];

        if (imageBuffers && imageBuffers.length > 0) {
            const optimizedBuffers = await Promise.all(
                imageBuffers.map(buffer => optimizeImage(buffer))
            );
            optimizedImageBase64s.push(...optimizedBuffers.map(b => b.toString('base64')));
        }

        if (imageUrls && imageUrls.length > 0) {
            const fetchedAndOptimized = await Promise.all(
                imageUrls.map(async (url) => {
                    try {
                        const response = await fetch(url);
                        if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
                        const arrayBuffer = await response.arrayBuffer();
                        const optimized = await optimizeImage(Buffer.from(arrayBuffer));
                        return optimized.toString('base64');
                    } catch (err) {
                        console.error(`Error processing image ${url}:`, err);
                        return null;
                    }
                })
            );
            optimizedImageBase64s.push(...fetchedAndOptimized.filter((b): b is string => b !== null));
        }

        if (optimizedImageBase64s.length === 0) {
            throw new Error('No images could be processed for PDF generation');
        }

        const imagesHtml = optimizedImageBase64s
            .map(base64 => `<img src="data:image/jpeg;base64,${base64}" alt="Imagem do relatório" style="width: 100%; height: auto;"/>`)
            .join('');

        let browser;

        if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
            browser = await puppeteerCore.launch({
                args: chromium.args,
                executablePath: await chromium.executablePath(),
                headless: true,
            });
        } else {
            browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
        }

        const page = await browser.newPage();

        const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 20px; background: white; }
            img { max-width: 100%; height: auto; margin-bottom: 20px; display: block; page-break-inside: avoid; }
            h1 { color: #333; }
          </style>
        </head>
        <body>
          <h1>Relatório de Imagens</h1>
          <p>Início do relatório</p>
          <p>Gerado em: ${new Date().toISOString()}</p>
          <p>Quantidade de imagens: ${optimizedImageBase64s.length}</p>
          <p>Request ID: ${jobId}</p>
          <p>Este relatório foi otimizado para reduzir o consumo de armazenamento.</p>
          <div style="page-break-after: always;"></div>
          <div style="display: flex; flex-direction: column; gap: 20px;">
            ${imagesHtml}
          </div>
          <p>Fim do relatório</p>
        </body>
      </html>
    `;

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
        });

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
