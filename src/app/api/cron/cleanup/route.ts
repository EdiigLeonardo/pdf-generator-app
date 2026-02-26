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
        console.log('[CRON] Starting cleanup...');

        // List all files with 'img-' prefix
        const files = await storageService.listFiles('img-');
        console.log(`[CRON] Found ${files.length} images to clean up.`);

        let deletedCount = 0;
        let errorCount = 0;

        await Promise.all(
            files.map(async (fileName) => {
                try {
                    await storageService.deleteFile(fileName);
                    deletedCount++;
                } catch (err) {
                    console.error(`[CRON] Failed to delete ${fileName}:`, err);
                    errorCount++;
                }
            })
        );

        console.log(`[CRON] Cleanup finished. Deleted: ${deletedCount}, Errors: ${errorCount}`);

        return NextResponse.json({
            success: true,
            deletedCount,
            errorCount,
            message: 'Daily cleanup completed successfully'
        });
    } catch (error) {
        console.error('[CRON] Cleanup error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
