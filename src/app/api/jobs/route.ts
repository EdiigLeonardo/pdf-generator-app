import { NextResponse } from 'next/server';
import { generatePdf } from '@/lib/pdf-service';
import { storageService } from '@/lib/cloud-storage-service';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const files = formData.getAll('images') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No images uploaded' }, { status: 400 });
        }

        console.log('[POST] files', { files });

        const imageUrls = await Promise.all(
            files.map(async (file, index) => {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const fileName = `img-${Date.now()}-${index}-${file.name}`;
                return await storageService.upload(buffer, fileName, file.type);
            })
        );

        const result = await generatePdf({ imageUrls });

        // Cleanup: Delete images from bucket after success
        if (result) {
            await Promise.all(
                imageUrls.map(async (url) => {
                    // Extract fileName from URL
                    // Standard Supabase public URL: .../public/[bucket]/[fileName]
                    const parts = url.split('/');
                    const fileName = parts[parts.length - 1];
                    try {
                        await storageService.deleteFile(fileName);
                    } catch (err) {
                        console.error(`Failed to delete file ${fileName}:`, err);
                    }
                })
            );
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
