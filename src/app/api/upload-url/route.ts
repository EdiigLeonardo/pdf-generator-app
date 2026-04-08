import { NextResponse } from 'next/server';
import { s3Client, s3Config } from '@/lib/s3-client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function POST(req: Request) {
    try {
        const { fileName, contentType = 'application/octet-stream' } = await req.json();

        if (!fileName) {
            return NextResponse.json({ error: 'File name is required' }, { status: 400 });
        }

        const bucketName = s3Config.bucketName || 'poc-digestaid';
        const endpoint = s3Config.endpoint;

        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: fileName,
            ContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

        const projectRef = endpoint.match(/https:\/\/(.*)\.storage/)?.[1];
        let publicUrl;

        if (projectRef) {
            publicUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/${bucketName}/${fileName}`;
        } else {
            publicUrl = `${endpoint}/${bucketName}/${fileName}`;
        }

        return NextResponse.json({
            uploadUrl: signedUrl,
            publicUrl
        });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
