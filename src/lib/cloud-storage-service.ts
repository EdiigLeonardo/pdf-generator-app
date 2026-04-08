import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, _Object } from '@aws-sdk/client-s3';
import { s3Client, s3Config } from './s3-client';
import fs from 'fs';
import path from 'path';

// Note: dotenv.config() is handled in s3-client.ts

export interface StorageOptions {
    fileName: string;
    contentType: string;
    buffer: Buffer;
}

export interface IStorageProvider {
    upload(options: StorageOptions): Promise<string>;
    read(fileName: string): Promise<Buffer>;
    delete(fileName: string): Promise<void>;
    list(prefix?: string): Promise<string[]>;
}


class S3StorageProvider implements IStorageProvider {
    private client: S3Client = s3Client;
    private bucketName: string = s3Config.bucketName;
    private endpoint: string = s3Config.endpoint;

    async upload({ fileName, contentType, buffer }: StorageOptions): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
            Body: buffer,
            ContentType: contentType,
        });

        await this.client.send(command);
        const projectRef = this.endpoint.match(/https:\/\/(.*)\.storage/)?.[1];
        if (projectRef) {
            return `https://${projectRef}.supabase.co/storage/v1/object/public/${this.bucketName}/${fileName}`;
        }

        return `${this.endpoint}/${this.bucketName}/${fileName}`;
    }

    async read(fileName: string): Promise<Buffer> {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
        });

        const response = await this.client.send(command);
        if (!response.Body) {
            throw new Error('Empty response body from S3');
        }

        const arrayBuffer = await response.Body.transformToByteArray();
        return Buffer.from(arrayBuffer);
    }

    async delete(fileName: string): Promise<void> {
        const command = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: fileName,
        });
        await this.client.send(command);
    }

    async list(prefix?: string): Promise<string[]> {
        const command = new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: prefix,
        });
        const response = await this.client.send(command);
        return response.Contents?.map((item: _Object) => item.Key || '').filter((key: string) => key !== '') || [];
    }
}

class SupabaseStorageProvider implements IStorageProvider {
    private supabase: SupabaseClient;
    private bucketName: string;

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.bucketName = process.env.SUPABASE_BUCKET_NAME || 'pdfs';
    }

    async upload({ fileName, contentType, buffer }: StorageOptions): Promise<string> {
        const { error } = await this.supabase.storage
            .from(this.bucketName)
            .upload(fileName, buffer, {
                contentType,
                upsert: true
            });

        if (error) {
            throw new Error(`Supabase upload failed: ${error.message}`);
        }

        const { data: { publicUrl } } = this.supabase.storage
            .from(this.bucketName)
            .getPublicUrl(fileName);

        return publicUrl;
    }

    async read(fileName: string): Promise<Buffer> {
        const { data, error } = await this.supabase.storage
            .from(this.bucketName)
            .download(fileName);

        if (error) {
            throw new Error(`Supabase download failed: ${error.message}`);
        }

        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    async delete(fileName: string): Promise<void> {
        const { error } = await this.supabase.storage
            .from(this.bucketName)
            .remove([fileName]);

        if (error) {
            throw new Error(`Supabase delete failed: ${error.message}`);
        }
    }

    async list(prefix?: string): Promise<string[]> {
        const { data, error } = await this.supabase.storage
            .from(this.bucketName)
            .list(prefix);

        if (error) {
            throw new Error(`Supabase list failed: ${error.message}`);
        }

        return data.map(item => item.name);
    }
}

class LocalStorageProvider implements IStorageProvider {
    private baseDir: string;
    private publicPath: string;

    constructor(subDir: string = 'pdfs') {
        this.baseDir = path.join(process.cwd(), 'public', subDir);
        this.publicPath = `/${subDir}`;
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    async upload({ fileName, buffer }: StorageOptions): Promise<string> {
        const filePath = path.join(this.baseDir, fileName);
        fs.writeFileSync(filePath, buffer);
        return `${this.publicPath}/${fileName}`;
    }

    async read(fileName: string): Promise<Buffer> {
        const filePath = path.join(this.baseDir, fileName);
        return fs.readFileSync(filePath);
    }

    async delete(fileName: string): Promise<void> {
        const filePath = path.join(this.baseDir, fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    async list(prefix?: string): Promise<string[]> {
        if (!fs.existsSync(this.baseDir)) return [];
        return fs.readdirSync(this.baseDir).filter(name => !prefix || name.startsWith(prefix));
    }
}

export class StorageService {
    private provider: IStorageProvider;

    constructor(subDir: string = 'pdfs') {
        if (process.env.SB_S3_ACCESS_KEY_ID && process.env.SB_S3_SECRET_ACCESS_KEY) {
            this.provider = new S3StorageProvider();
        } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
            this.provider = new SupabaseStorageProvider();
        } else {
            this.provider = new LocalStorageProvider(subDir);
        }
    }

    async upload(buffer: Buffer, fileName: string, contentType: string = 'application/octet-stream'): Promise<string> {
        return this.provider.upload({ buffer, fileName, contentType });
    }

    async readFile(fileName: string): Promise<Buffer> {
        return this.provider.read(fileName);
    }

    async deleteFile(fileName: string): Promise<void> {
        return this.provider.delete(fileName);
    }

    async listFiles(prefix?: string): Promise<string[]> {
        return this.provider.list(prefix);
    }

    async deleteAllFiles(prefix?: string): Promise<void> {
        const files = await this.listFiles(prefix);
        if (files.length === 0) return;

        await Promise.all(files.map(file => this.deleteFile(file)));
    }
}

export const storageService = new StorageService();
