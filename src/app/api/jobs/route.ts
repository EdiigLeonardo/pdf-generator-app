import { NextResponse } from 'next/server';
import { generatePdf } from '@/lib/pdf-service';
import { storageService } from '@/lib/cloud-storage-service';

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const { imageUrls, imageBuffers } = await req.json();

        if ((!imageUrls || imageUrls.length === 0) && (!imageBuffers || imageBuffers.length === 0)) {
            return NextResponse.json({ error: 'No images provided' }, { status: 400 });
        }

        const buffers = imageBuffers ? imageBuffers.map((b: string) => Buffer.from(b, 'base64')) : undefined;

        const result = await generatePdf({ imageUrls, imageBuffers: buffers });
        if (result && imageUrls) {
            await Promise.all(
                imageUrls.map(async (url: string) => {
                    if (url.includes(process.env.SUPABASE_BUCKET_NAME || '')) {
                        const parts = url.split('/');
                        const fileName = parts[parts.length - 1];
                        try {
                            await storageService.deleteFile(fileName);
                        } catch (err) {
                            console.error(`Failed to delete file ${fileName}:`, err);
                        }
                    }
                })
            );
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('API Error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error during PDF generation';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
