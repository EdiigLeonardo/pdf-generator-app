import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const endpoint = process.env.SB_S3_ENDPOINT || '';
const region = process.env.SB_S3_REGION || 'us-east-1';
const accessKeyId = process.env.SB_S3_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.SB_S3_SECRET_ACCESS_KEY || '';

export const s3Client = new S3Client({
    forcePathStyle: true,
    region,
    endpoint,
    credentials: {
        accessKeyId,
        secretAccessKey,
    }
});

export const s3Config = {
    endpoint,
    bucketName: process.env.SUPABASE_BUCKET_NAME || '',
};
