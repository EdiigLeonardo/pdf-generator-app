import fs from 'fs';
import path from 'path';

describe('PDF Generation E2E Test', () => {
    // E2E tests can take a while, especially with 500 images
    jest.setTimeout(300000); // 5 minutes

    const API_URL = 'http://localhost:3000/api/jobs';

    it('should generate a PDF from 500 uploaded images and measure execution time', async () => {
        console.log('Starting E2E test with 500 images...');
        const startTime = Date.now();

        // Use a real image from the project if available, or a small buffer
        const imagePath = path.join(process.cwd(), 'test-image.png');
        let imageBuffer: Buffer;

        if (fs.existsSync(imagePath)) {
            imageBuffer = fs.readFileSync(imagePath);
        } else {
            // Fallback to a tiny 1x1 PNG if test-image.png doesn't exist
            imageBuffer = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
                'base64'
            );
        }

        const formData = new FormData();
        for (let i = 0; i < 500; i++) {
            // We append the same image 500 times
            const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
            formData.append('images', blob, `test-image-${i}.png`);
        }

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData,
            });

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result).toBeDefined();
            expect(result.pdfUrl).toBeDefined();
            expect(result.executionTime).toBeDefined();

            console.log('E2E Test Result:');
            console.log(`- Status: ${response.status}`);
            console.log(`- PDF URL: ${result.pdfUrl}`);
            console.log(`- Server Execution Time: ${result.executionTime}`);
            console.log(`- Total Round-trip Time: ${totalTime}ms`);

        } catch (error) {
            console.error('E2E Test Failed:', error);
            throw error;
        }
    });
});
