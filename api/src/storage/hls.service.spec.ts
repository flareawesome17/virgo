import { LADDER, buildLadderArgs, ladderFor } from './hls.service';
import { hlsPrefixFor } from './media-link.service';

describe('ladderFor', () => {
  it('gives a 1080p landscape source all three rungs', () => {
    const rungs = ladderFor(1920, 1080);
    expect(rungs.map((r) => r.shortEdge)).toEqual([360, 720, 1080]);
    expect(rungs.map((r) => `${r.width}x${r.height}`)).toEqual([
      '640x360',
      '1280x720',
      '1920x1080',
    ]);
  });

  it('measures a PORTRAIT source on its short edge', () => {
    // The regression this exists for. A 1080x1920 phone film has a short edge
    // of 1080, so it earns all three rungs and its 720 rung is 720x1280.
    // Treating the rung as a height would make that rung 405x720 — a strip.
    const rungs = ladderFor(1080, 1920);
    expect(rungs.map((r) => `${r.width}x${r.height}`)).toEqual([
      '360x640',
      '720x1280',
      '1080x1920',
    ]);
  });

  it('never enlarges: a 720p source gets no 1080 rung', () => {
    expect(ladderFor(1280, 720).map((r) => r.shortEdge)).toEqual([360, 720]);
  });

  it('gives nothing to a source below the narrowest rung', () => {
    // The proxy already covers these, and a one-rung ladder is a worse MP4.
    expect(ladderFor(426, 240)).toEqual([]);
  });

  it('gives nothing when dimensions are unknown', () => {
    expect(ladderFor(0, 0)).toEqual([]);
    expect(ladderFor(1920, 0)).toEqual([]);
  });

  it('always produces even dimensions, because libx264 refuses odd ones', () => {
    for (const [w, h] of [[1921, 1081], [1439, 1079], [1081, 1921]]) {
      for (const rung of ladderFor(w, h)) {
        expect(rung.width % 2).toBe(0);
        expect(rung.height % 2).toBe(0);
      }
    }
  });

  it('keeps rungs narrowest first, which is the order a master expects', () => {
    const widths = ladderFor(3840, 2160).map((r) => r.shortEdge);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
  });
});

describe('buildLadderArgs', () => {
  const rungs = ladderFor(1920, 1080);
  const args = buildLadderArgs('https://src.example/film.mov', '/srv/out', rungs);
  const valueAfter = (flag: string) => args[args.indexOf(flag) + 1];

  it('maps one variant per rung, video and audio paired', () => {
    // A wrong var_stream_map produces a master playlist that looks right and
    // refers to renditions that were never written — which surfaces as a film
    // that plays for six seconds and stops.
    expect(valueAfter('-var_stream_map')).toBe('v:0,a:0 v:1,a:1 v:2,a:2');
  });

  it('splits the video into exactly as many branches as there are rungs', () => {
    expect(valueAfter('-filter_complex')).toContain(`split=${rungs.length}`);
    for (const [i, rung] of rungs.entries()) {
      expect(valueAfter('-filter_complex')).toContain(
        `[s${i}]scale=${rung.width}:${rung.height}[v${i}]`,
      );
    }
  });

  it('gives every rung its own bitrate ceiling', () => {
    for (const [i, rung] of rungs.entries()) {
      expect(valueAfter(`-b:v:${i}`)).toBe(`${rung.bitrate}k`);
      expect(valueAfter(`-maxrate:v:${i}`)).toBe(`${rung.maxrate}k`);
    }
  });

  it('writes one audio mapping per rung, so a switch needs no separate track', () => {
    expect(args.filter((a) => a === 'a:0?')).toHaveLength(rungs.length);
  });

  it('pins the settings a ladder cannot work without', () => {
    // Each of these has a failure mode that looks like something else:
    // odd pixel formats are "cannot play in this browser", unaligned
    // keyframes are a stutter at the moment quality changes.
    expect(valueAfter('-pix_fmt')).toBe('yuv420p');
    expect(valueAfter('-force_key_frames')).toBe('expr:gte(t,n_forced*2)');
    expect(valueAfter('-hls_segment_type')).toBe('fmp4');
    expect(valueAfter('-hls_flags')).toBe('independent_segments');
    expect(valueAfter('-hls_playlist_type')).toBe('vod');
  });

  it('puts %v in the output path, which is what makes var_stream_map fan out', () => {
    expect(args.at(-1)).toBe('/srv/out/v%v/playlist.m3u8');
    expect(valueAfter('-hls_segment_filename')).toBe('/srv/out/v%v/%04d.m4s');
    expect(valueAfter('-master_pl_name')).toBe('master.m3u8');
  });

  it('scales down to a single rung without breaking the mapping', () => {
    const one = buildLadderArgs('u', '/o', ladderFor(640, 360));
    expect(one[one.indexOf('-var_stream_map') + 1]).toBe('v:0,a:0');
  });
});

describe('LADDER', () => {
  it('is ordered narrowest first and free of duplicates', () => {
    const edges = LADDER.map((r) => r.shortEdge);
    expect(edges).toEqual([...edges].sort((a, b) => a - b));
    expect(new Set(edges).size).toBe(edges.length);
  });

  it('keeps every maxrate above its target bitrate', () => {
    for (const rung of LADDER) expect(rung.maxrate).toBeGreaterThan(rung.bitrate);
  });
});

describe('hlsPrefixFor', () => {
  it('is a directory beside the source, ending in -hls', () => {
    expect(hlsPrefixFor('users/u/albums/2026/08/clip.mov')).toBe(
      'users/u/albums/2026/08/clip-hls',
    );
  });

  it('ends in -hls, which is what the nginx location splits on', () => {
    // The /h/ location captures the ladder directory with a non-greedy
    // `.+?-hls`. A prefix not ending in that suffix would never match.
    expect(hlsPrefixFor('users/u/a/x.mp4').endsWith('-hls')).toBe(true);
  });
});
