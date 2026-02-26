import { NextResponse } from 'next/server';
import { storageService } from '@/lib/cloud-storage-service';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    // Simple security check using a CRON_SECRET environment variable
    if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[CRON] Starting full bucket cleanup...');

        await storageService.deleteAllFiles();

        return NextResponse.json({
            success: true,
            message: 'Bucket cleanup completed successfully'
        });
    } catch (error) {
        console.error('[CRON] Cleanup error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
