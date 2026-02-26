import { NextResponse } from 'next/server';
import { storageService } from '@/lib/cloud-storage-service';

export async function POST() {
    try {
        console.log('[Emergency Cleanup] Starting full bucket wipe due to job failure...');
        await storageService.deleteAllFiles();
        return NextResponse.json({ success: true, message: 'Emergency cleanup completed' });
    } catch (error) {
        console.error('Emergency Cleanup Error:', error);
        return NextResponse.json({ error: 'Internal Server Error during cleanup' }, { status: 500 });
    }
}
