import { ImageResponse } from 'next/og';

/**
 * The card that shows when someone pastes virgo.ph into Messenger or Viber.
 *
 * Generated rather than a static file: the previous card pointed at the
 * 512×512 app icon while declaring `summary_large_image`, so every share
 * rendered a small logo adrift in a 1200×630 grey box. Since the realistic
 * first traffic here is a link dropped into a Facebook group, that was a
 * costly thing to get wrong.
 *
 * No remote fonts or images — the whole thing is text and colour, so it
 * cannot fail on a network fetch at build time.
 */
/**
 * Generated at build time rather than per request.
 *
 * Required by the desktop build, which is a static export and cannot run a
 * route handler at all. Correct for the hosted build too: as the note above
 * says, this card is text and colour with no remote fetch, so there is
 * nothing about it that needs a request to resolve.
 */
export const dynamic = 'force-static';
export const runtime = 'nodejs';
export const alt =
  'Virgo — hire photographers, videographers, editors and HMUAs in the Philippines';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#1C1917',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#B66A40',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#F2EDE8', fontSize: 30, fontWeight: 700 }}>
              Virgo
            </span>
            <span style={{ color: '#B66A40', fontSize: 15, letterSpacing: 3 }}>
              CREATIVE OS
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <span
            style={{
              color: '#F2EDE8',
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1.1,
              maxWidth: 900,
            }}
          >
            Hire photographers, editors and HMUAs near you
          </span>
          <span style={{ color: '#A89489', fontSize: 27, maxWidth: 860 }}>
            Then run the whole job in one place — client links that open
            without an account, and files that delete themselves.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {['Photographers', 'Videographers', 'Editors', 'HMUAs'].map((role) => (
            <span
              key={role}
              style={{
                color: '#B66A40',
                fontSize: 20,
                border: '1px solid #B66A4055',
                borderRadius: 999,
                padding: '8px 20px',
              }}
            >
              {role}
            </span>
          ))}
          <span style={{ color: '#6F625A', fontSize: 20, marginLeft: 'auto' }}>
            virgo.ph
          </span>
        </div>
      </div>
    ),
    size,
  );
}
