import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { sendContentMd5OnBulkDelete } from './bulk-delete-md5';

interface Sent {
  headers: Record<string, string>;
  body: unknown;
}

/** A client that records the request it would have sent, and sends nothing. */
function capturingClient(): { client: S3Client; sent: Sent[] } {
  const sent: Sent[] = [];
  const client = new S3Client({
    endpoint: 'https://s3.example.invalid',
    region: 'us-west-004',
    credentials: { accessKeyId: 'test-key-id', secretAccessKey: 'test-application-key' },
    forcePathStyle: true,
    maxAttempts: 1,
    requestHandler: {
      handle: async (request: { headers: Record<string, string>; body: unknown }) => {
        sent.push({ headers: { ...request.headers }, body: request.body });
        throw new Error('captured');
      },
    } as never,
  });
  sendContentMd5OnBulkDelete(client);
  return { client, sent };
}

const lower = (headers: Record<string, string>) =>
  Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));

describe('DeleteObjects as Backblaze accepts it', () => {
  it('carries a signed Content-MD5 of its body and no SDK checksum', async () => {
    const { client, sent } = capturingClient();
    await client
      .send(
        new DeleteObjectsCommand({
          Bucket: 'virgo-media',
          Delete: { Objects: [{ Key: 'users/a/albums/2026/10/x.jpg' }], Quiet: false },
        }),
      )
      .catch(() => undefined);

    expect(sent).toHaveLength(1);
    const headers = lower(sent[0].headers);
    const expected = createHash('md5')
      .update(sent[0].body as string)
      .digest('base64');
    expect(headers['content-md5']).toBe(expected);
    expect(Object.keys(headers).filter((h) => h.startsWith('x-amz-checksum-'))).toEqual([]);
    expect(headers['x-amz-sdk-checksum-algorithm']).toBeUndefined();
    // Signed after the header was set, so B2 checks it rather than rejecting
    // a signature that does not cover it.
    expect(headers.authorization).toMatch(/SignedHeaders=[^,]*content-md5/);
  });

  it('leaves single deletes and uploads exactly as the SDK sends them', async () => {
    const { client, sent } = capturingClient();
    await client
      .send(new DeleteObjectCommand({ Bucket: 'virgo-media', Key: 'users/a/x.jpg' }))
      .catch(() => undefined);
    await client
      .send(new PutObjectCommand({ Bucket: 'virgo-media', Key: 'users/a/x.webp', Body: 'bytes' }))
      .catch(() => undefined);

    expect(sent).toHaveLength(2);
    expect(lower(sent[0].headers)['content-md5']).toBeUndefined();
    expect(lower(sent[1].headers)['content-md5']).toBeUndefined();
  });
});
