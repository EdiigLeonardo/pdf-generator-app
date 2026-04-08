import { NextResponse } from 'next/server';
import { storageService } from '@/lib/cloud-storage-service';

export async function POST(req: Request) {
    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        const parts = url.split('/');
        const fileName = parts[parts.length - 1];

        if (!fileName.startsWith('pdf-')) {
            return NextResponse.json({ error: 'Invalid file for cleanup' }, { status: 400 });
        }

        console.log(`[Cleanup] Deleting PDF: ${fileName}`);
        await storageService.deleteFile(fileName);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Cleanup Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
