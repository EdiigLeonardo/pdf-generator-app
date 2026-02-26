import puppeteer from 'puppeteer';
import puppeteerCore from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { storageService } from './cloud-storage-service';
import dotenv from 'dotenv';
import sharp from 'sharp';
import axios from 'axios';
import { PDFDocument, PageSizes } from 'pdf-lib';

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
        const optimizedBuffers: Buffer[] = [];

        if (imageBuffers && imageBuffers.length > 0) {
            const optimized = await Promise.all(
                imageBuffers.map(buffer => optimizeImage(buffer))
            );
            optimizedBuffers.push(...optimized);
        }

        if (imageUrls && imageUrls.length > 0) {
            const fetchedAndOptimized = await Promise.all(
                imageUrls.map(async (url) => {
                    try {
                        let buffer: Buffer;
                        const fileName = getFileNameFromUrl(url);
                        if (fileName && fileName.startsWith('img-')) {
                            buffer = await storageService.readFile(fileName);
                        } else {
                            const { data: arrayBuffer } = await axios.get(url, { responseType: 'arraybuffer' });
                            buffer = Buffer.from(arrayBuffer);
                        }
                        return await optimizeImage(buffer);
                    } catch (err) {
                        console.error(`[generatePdf] Error processing image ${url}:`, err);
                        return null;
                    }
                })
            );
            optimizedBuffers.push(...fetchedAndOptimized.filter((b): b is Buffer => b !== null));
        }

        if (optimizedBuffers.length === 0) {
            throw new Error('Could not process any images for the PDF.');
        }

        let browser;
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.NETLIFY) {
            const executablePath = await chromium.executablePath(
                'https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.tar'
            );
            browser = await puppeteerCore.launch({
                args: chromium.args,
                executablePath,
                headless: true,
            });
        } else {
            browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                headless: true,
            });
        }

        const page = await browser.newPage();
        const coverHtml = `
      <html>
        <head>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 60px; background: white; color: #1e293b; }
            h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 40px; font-size: 32px; }
            .meta { color: #64748b; font-size: 16px; margin-bottom: 60px; border-left: 4px solid #3b82f6; padding-left: 20px; line-height: 1.6; }
            .footer { position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; color: #94a3b8; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Relatório Digital de Obra</h1>
          <div class="meta">
            <p><strong>Gerado em:</strong> ${new Date().toLocaleString('pt-PT')}</p>
            <p><strong>Total de Registos Fotográficos:</strong> ${optimizedBuffers.length}</p>
            <p><strong>Código do Trabalho:</strong> ${jobId}</p>
            <p>Este documento é uma cópia digital fiel das observações recolhidas no local.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} PDF Generator Pro - Processamento Híbrido de Alta Performance</p>
          </div>
        </body>
      </html>
    `;

        await page.setContent(coverHtml, { waitUntil: 'networkidle0' });
        const coverBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        console.log(`[generatePdf] Embedding ${optimizedBuffers.length} images directly via pdf-lib...`);
        const pdfDoc = await PDFDocument.load(coverBuffer);

        const pageWidth = PageSizes.A4[0];
        const pageHeight = PageSizes.A4[1];
        const margin = 40;
        const gap = 20;
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - (margin * 2);

        for (let i = 0; i < optimizedBuffers.length; i += 2) {
            const pdfPage = pdfDoc.addPage(PageSizes.A4);

            const img1 = await pdfDoc.embedJpg(optimizedBuffers[i]);
            const dims1 = img1.scaleToFit(availableWidth, (availableHeight - gap) / 2);
            pdfPage.drawImage(img1, {
                x: margin + (availableWidth - dims1.width) / 2,
                y: pageHeight - margin - dims1.height,
                width: dims1.width,
                height: dims1.height,
            });

            if (optimizedBuffers[i + 1]) {
                const img2 = await pdfDoc.embedJpg(optimizedBuffers[i + 1]);
                const dims2 = img2.scaleToFit(availableWidth, (availableHeight - gap) / 2);
                pdfPage.drawImage(img2, {
                    x: margin + (availableWidth - dims2.width) / 2,
                    y: margin + ((availableHeight - gap) / 2 - dims2.height) / 2,
                    width: dims2.width,
                    height: dims2.height,
                });
            }
        }

        const finalPdfBuffer = await pdfDoc.save();
        const fileName = `pdf-${jobId}-${Date.now()}.pdf`;
        console.log(`[generatePdf] Uploading Hybrid PDF (${(finalPdfBuffer.length / 1024 / 1024).toFixed(2)} MB)...`);
        const publicUrl = await storageService.upload(Buffer.from(finalPdfBuffer), fileName, 'application/pdf');

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
