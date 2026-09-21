import { Image, type ImageContentFit, type ImageProps } from 'expo-image';

/**
 * The signature half of a presigned B2 URL.
 *
 * Every B2 read URL carries its credential, date and signature in the query,
 * and all three change when the signing window rolls over.
 */
const PRESIGNED_QUERY = /[?&]X-Amz-(?:Signature|Credential|Date)=/;

/**
 * The token at the front of a media-host path.
 *
 * `https://media.virgo.ph/<expiry>/<signature>/<key>` for a rendition, with an
 * `h/` in front for an HLS ladder. The expiry is ten digits and the signature
 * is twenty-two URL-safe base64 characters — see nginx.conf.template.
 */
const MEDIA_HOST_TOKEN = /^(https?:\/\/[^/]+)\/(?:h\/)?\d{10}\/[A-Za-z0-9_-]{22}\//;

/**
 * What identifies an image across re-signings: where it lives, minus the proof
 * of permission to fetch it.
 *
 * Every media URL the API hands out is re-signed on a five-minute window, so
 * the same thumbnail arrives under a different URL every five minutes.
 * expo-image caches by URL unless told otherwise, and so did React Native's
 * Image before it — which is why reopening the app downloaded every thumbnail
 * and profile picture again, as if it had never seen them.
 *
 * The part that survives re-signing is the object's own path: bucket and key
 * on B2, key alone on the media host. Keys are never reused — a new upload,
 * avatar or encode writes a new one — so a path that stays the same really is
 * the same image, and it is safe to keep indefinitely.
 *
 * A URL with neither kind of signature passes through untouched, query
 * included, because a query on an ordinary URL may be what distinguishes it.
 *
 * String work rather than `new URL()`: React Native's URL implementation is
 * incomplete, and this runs for every image on every render.
 */
export function stableCacheKey(uri: string): string {
  const unsigned = PRESIGNED_QUERY.test(uri) ? uri.split('?')[0] : uri;
  return unsigned.replace(MEDIA_HOST_TOKEN, '$1/');
}

/** React Native's names for what expo-image calls `contentFit`. */
type ResizeMode = 'cover' | 'contain' | 'stretch' | 'center' | 'repeat';

function fitFor(mode: ResizeMode | undefined): ImageContentFit | undefined {
  switch (mode) {
    case 'contain':
      return 'contain';
    case 'stretch':
      return 'fill';
    case 'center':
      return 'none';
    case 'cover':
    case 'repeat':
      return 'cover';
    default:
      return undefined;
  }
}

/**
 * Also accepts React Native's `{ uri }` with a null in it. Half the call sites
 * pass a profile field straight through, and a person with no avatar is null
 * rather than undefined.
 */
type Source = ImageProps['source'] | { uri?: string | null };

export type RemoteImageProps = Omit<ImageProps, 'source'> & {
  source?: Source;
  /** React Native's spelling, kept so a call site can move here unchanged. */
  resizeMode?: ResizeMode;
};

/**
 * Every image the app fetches from the network.
 *
 * It exists to make images load once. Everything that used to render a remote
 * picture had one of two problems, and most had both:
 *
 * - **React Native's `Image`**, which keeps an image only if the response says
 *   to. Nothing Virgo stores carries a `Cache-Control` header, so in practice
 *   it kept nothing, and every profile picture, chat head and portfolio image
 *   was fetched from Backblaze in Virginia on every open.
 * - **expo-image with no `cacheKey`**, which caches properly but keys on the
 *   URL — and the URL changes every five minutes.
 *
 * So this is expo-image keyed on {@link stableCacheKey}, held in memory and on
 * disk. A picture seen once is on the device from then on, whatever the
 * server's headers say and however many times its URL is re-signed.
 *
 * `recyclingKey` defaults to the same key. In a list, a recycled row otherwise
 * shows the previous row's picture for a frame before the new one arrives.
 */
export function RemoteImage({
  source,
  resizeMode,
  contentFit,
  cachePolicy = 'memory-disk',
  transition = 120,
  recyclingKey,
  ...rest
}: RemoteImageProps) {
  const uri =
    source !== null &&
    typeof source === 'object' &&
    !Array.isArray(source) &&
    'uri' in source
      ? source.uri
      : undefined;

  const remote = typeof uri === 'string' && /^https?:\/\//i.test(uri);
  const key = remote ? stableCacheKey(uri) : undefined;

  // A null or empty uri renders nothing, which is what React Native's Image
  // did with `{ uri: null }` too — a missing avatar leaves its circle empty
  // rather than throwing.
  const resolved: ImageProps['source'] = remote
    ? { uri, cacheKey: key }
    : uri === null || uri === ''
      ? null
      : (source as ImageProps['source']);

  return (
    <Image
      source={resolved}
      contentFit={contentFit ?? fitFor(resizeMode)}
      cachePolicy={cachePolicy}
      transition={transition}
      recyclingKey={recyclingKey ?? key}
      {...rest}
    />
  );
}
