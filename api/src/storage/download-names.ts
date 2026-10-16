/**
 * What downloads are called: the header that names them and the names inside
 * a zip. Kept apart from the zip streamer so importing these does not pull in
 * archiver, which is ESM-only and would break every spec that touches storage.
 */

/**
 * `Content-Disposition` for a download, safe for any filename.
 *
 * Two forms on purpose: a stripped ASCII `filename` that every client can
 * read, and RFC 5987 `filename*` carrying the real one. Album names are
 * user-supplied and Filipino ones routinely contain accents — sending those
 * raw produces a header a browser either mangles or rejects outright.
 */
export function contentDisposition(name: string): string {
  // Control characters (a newline would split the header) and lone surrogates
  // (encodeURIComponent throws URIError on them — safeFileStem's slice can cut
  // an emoji in half) are removed before either form is built.
  const clean = name
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '_');
  // Printable ASCII only for the plain form, and neither of the two
  // characters that would end the quoted string early.
  const ascii = clean.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${rfc5987(clean)}`;
}

/**
 * Percent-encodes everything outside the unreserved set.
 *
 * `encodeURIComponent` leaves `! ' ( ) *` bare, and `' ( ) *` are not legal in
 * an RFC 5987 `value-chars` run. Backblaze B2 validates the signed
 * `response-content-disposition` strictly and answers the whole download with
 * "InvalidRequest … must use valid extended value syntax", so a client whose
 * album was called "Ana's Wedding" or whose file was "IMG (2).jpg" got an XML
 * error page instead of their photos. Encoding the full reserved set costs
 * nothing: every client decodes it back to the same name.
 */
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/**
 * Strips what a filesystem will not take, so a download never lands as
 * "Reyes/Santos — Wedding.zip" and silently becomes a folder.
 */
export function safeFileStem(name: string): string {
  return (
    name
      // Includes the backslash: a Windows client unzipping "A\B - 001.jpg"
      // gets a folder called A, not a file.
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Album'
  );
}

/**
 * Names made unique for a zip, keeping extensions: two cameras both writing
 * `DSC_0001.JPG` into one album must not become one entry that overwrote the
 * other on the way out.
 */
export function uniqueNames(names: readonly string[]): string[] {
  // Case-insensitive, because Windows and macOS unzip into filesystems that
  // are, and "a.JPG" beside "a.jpg" is one file there.
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) {
      candidate = `${stem} (${n})${ext}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
