import { generatePdf } from './pdf-service';

jest.mock('./cloud-storage-service', () => ({
    storageService: {
        upload: jest.fn().mockResolvedValue('https://mock-storage.com/generated-pdf.pdf'),
    },
}));

describe('PdfService Scale Test', () => {
    jest.setTimeout(60000);

    it('should generate a PDF with 500 identical image URLs', async () => {
        const imageUrl = 'https://via.placeholder.com/150';
        const imageUrls = Array(500).fill(imageUrl);

        const result = await generatePdf({
            imageUrls,
            jobId: 'test-scale-500'
        });

        expect(result).toBeDefined();
        if (result) {
            expect(result.pdfUrl).toBe('https://mock-storage.com/generated-pdf.pdf');
            expect(result.executionTime).toBeDefined();
            console.log(`Test Scale 500: Execution Time = ${result.executionTime}`);
        }
    });

    it('should generate a PDF with 500 small image buffers', async () => {
        const tinyPngBuffer = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
            'base64'
        );
        const imageBuffers = Array(500).fill(tinyPngBuffer);

        const result = await generatePdf({
            imageBuffers,
            jobId: 'test-buffers-500'
        });

        expect(result).toBeDefined();
        if (result) {
            expect(result.pdfUrl).toBe('https://mock-storage.com/generated-pdf.pdf');
            expect(result.executionTime).toBeDefined();
            console.log(`Test Buffers 500: Execution Time = ${result.executionTime}`);
        }
    });
});
