import { randomUUID } from 'node:crypto';
import { S3Client, HeadObjectCommand, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fail } from '../lib/validation.js';

const types = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
export function createImages({ client = new S3Client({}), bucket = process.env.IMAGES_BUCKET } = {}) {
  function configured() { if (!bucket) throw new Error('IMAGES_BUCKET is required.'); }
  return {
    async upload(userId, { contentType, size, purpose = 'listing' }) {
      configured();
      const max = purpose === 'profile' ? 700 * 1024 : 2 * 1024 * 1024;
      if (!['listing', 'profile'].includes(purpose) || !Object.hasOwn(types, contentType) || !Number.isInteger(size) || size < 12 || size > max) fail('Invalid image type or size.');
      const Key = `pending/${userId}/${randomUUID()}.${types[contentType]}`;
      const post = await createPresignedPost(client, {
        Bucket: bucket, Key, Expires: 120,
        Fields: { 'Content-Type': contentType },
        Conditions: [['content-length-range', 12, max], ['eq', '$Content-Type', contentType]],
      });
      return { ...post, reference: `s3:${Key}` };
    },
    async finalize(userId, references, existing = [], maxBytes = 2 * 1024 * 1024) {
      configured();
      if (!Array.isArray(references) || references.length > 5 || new Set(references).size !== references.length) fail('Choose up to five different images.');
      const saved = [];
      for (const reference of references) {
        if (existing.includes(reference)) { saved.push(reference); continue; }
        if (typeof reference !== 'string' || !reference.startsWith(`s3:pending/${userId}/`) || !/^s3:pending\/[a-f0-9-]+\/[a-f0-9-]+\.(png|jpeg|webp)$/.test(reference)) fail('Upload a new image or retain this listing’s own images.');
        const Key = reference.slice(3);
        let head;
        try { head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key })); }
        catch (error) { if (error.$metadata?.httpStatusCode === 404) fail('Uploaded image was not found.'); throw error; }
        if (!types[head.ContentType] || head.ContentLength < 12 || head.ContentLength > maxBytes) fail('Uploaded image has an invalid type or size.');
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key, Range: 'bytes=0-11', IfMatch: head.ETag }));
        const bytes = Buffer.from(await result.Body.transformToByteArray());
        const valid = head.ContentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : head.ContentType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!valid) fail('Image content does not match its file type.');
        // Copy into a fresh key outside the signed upload scope, preventing a later upload from changing a published image.
        const finalKey = `media/${userId}/${randomUUID()}.${types[head.ContentType]}`;
        await client.send(new CopyObjectCommand({ Bucket: bucket, Key: finalKey, CopySource: `${bucket}/${Key}`, CopySourceIfMatch: head.ETag }));
        saved.push(`s3:${finalKey}`);
      }
      return saved;
    },
    async url(reference) {
      if (!reference) return null;
      configured();
      if (!reference.startsWith('s3:media/')) return null;
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: reference.slice(3) }), { expiresIn: 3600 });
    },
  };
}
