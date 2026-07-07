import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

export interface ImageStore {
  upload(buffer: Buffer, contentType: string): Promise<string>; // returns r2Key
  publicUrl(key: string): string;
}

const EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
};

export class R2Store implements ImageStore {
  private client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  async upload(buffer: Buffer, contentType: string): Promise<string> {
    const key = `inputs/${randomUUID()}.${EXT[contentType] ?? "bin"}`;
    await this.client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return key;
  }

  publicUrl(key: string): string {
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }
}
