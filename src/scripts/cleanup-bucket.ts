import { storageService } from '../lib/cloud-storage-service';

/**
 * Script for clearing all files from the configured storage bucket.
 * To run: npx tsx src/scripts/cleanup-bucket.ts
 */
export async function cleanupBucket() {
    console.log('[Bucket Cleanup Utility] Starting cleanup...');
    try {
        await storageService.deleteAllFiles();
    } catch (error) {
        console.error('[Bucket Cleanup Utility] Failed to cleanup bucket:', error);
        process.exit(1);
    }
}

cleanupBucket();
