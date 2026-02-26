import { storageService } from '../lib/cloud-storage-service';

/**
 * Script for clearing all files from the configured storage bucket.
 * To run: npx tsx src/scripts/cleanup-bucket.ts
 */
async function main() {
    console.log('--- Bucket Cleanup Utility ---');
    try {
        await storageService.deleteAllFiles();
    } catch (error) {
        console.error('Failed to cleanup bucket:', error);
        process.exit(1);
    }
}

main();
