'use client';

import { m, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { MEDIA } from '../../media.generated';
import { camera, r2, seg } from '../cinema/ease';
import { usePrologueProgress } from '../islands/prologue';
import { useMotionGate } from '../motion';

/**
 * The hero film (05-cinema.md §1.11; rendered by marketing-assets/blender/
 * hero_film.py): a dark studio, the cine camera lit like a product film.
 *
 * In motion the opening plays once (the lights come up and the camera
 * dollies in), then hands over to a seamless loop: the intro's last frame is
 * the loop's first, and the loop is shown only once it is actually playing,
 * so there is no black frame between them. The first scroll pushes the
 * camera into the lens glass and through it into the night sky.
 *
 * The lit still stands in wherever the film cannot play: reduced motion, no
 * JavaScript, and phones that refuse to autoplay (iOS Low Power Mode). The
 * film pauses with Pause motion and whenever the hero is off screen.
 */

type Phase = 'wait' | 'intro' | 'loop' | 'still';

function Still({ className = '' }: { className?: string }) {
  return (
    <picture>
      <source type={MEDIA.filmStillAvif.type} srcSet={MEDIA.filmStillAvif.url} />
      <source type={MEDIA.filmStillWebp.type} srcSet={MEDIA.filmStillWebp.url} />
      <img
        src={MEDIA.filmStillJpg.url}
        width={MEDIA.filmStillJpg.width}
        height={MEDIA.filmStillJpg.height}
        alt=""
        decoding="async"
        className={`absolute inset-0 size-full object-cover object-[60%_50%] lg:object-[6%_50%] ${className}`}
      />
    </picture>
  );
}

export function FilmPlate() {
  const gate = useMotionGate();
  const progress = usePrologueProgress();
  const fallback = useMotionValue(0);
  const p = progress ?? fallback;
  const box = useRef<HTMLDivElement>(null);
  const intro = useRef<HTMLVideoElement>(null);
  const loop = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('wait');

  // The pointer, −1…1 (desktop): the plate moves against it a little, so the frame has depth.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const transform = useTransform([p, mx, my], ([v, x, y]: number[]) => {
    const push = camera(seg(v, 0.02, 0.3));
    return `translate3d(${r2(-x * 12)}px,${r2(-y * 8)}px,0) scale(${r2(1.04 + push * 2.6)})`;
  });
  const opacity = useTransform(p, (v) => r2(1 - seg(v, 0.16, 0.3)));

  // Play the opening; hand over to the loop; fall back to the still if the phone will not autoplay.
  useEffect(() => {
    if (!gate.motion) return;
    const a = intro.current;
    const b = loop.current;
    if (!a || !b) return;
    let gone = false;
    const onIntroPlaying = () => {
      if (gone) return;
      setPhase('intro');
      b.preload = 'auto';
      b.load();
    };
    const onIntroEnded = () => {
      b.currentTime = 0;
      void b.play().catch(() => setPhase('still'));
    };
    const onLoopPlaying = () => !gone && setPhase('loop');
    a.addEventListener('playing', onIntroPlaying);
    a.addEventListener('ended', onIntroEnded);
    b.addEventListener('playing', onLoopPlaying);
    void a.play().catch(() => !gone && setPhase('still'));
    return () => {
      gone = true;
      a.removeEventListener('playing', onIntroPlaying);
      a.removeEventListener('ended', onIntroEnded);
      b.removeEventListener('playing', onLoopPlaying);
    };
  }, [gate.motion]);

  // Pause motion, and the hero off screen: the film stops.
  useEffect(() => {
    const el = box.current;
    if (!gate.motion || !el) return;
    let seen = true;
    const sync = () => {
      const run = seen && !gate.paused;
      for (const v of [intro.current, loop.current]) {
        if (!v) continue;
        const live = (v === intro.current && phase === 'intro') || (v === loop.current && phase === 'loop');
        if (run && live && v.paused && !v.ended) void v.play().catch(() => undefined);
        if (!run && !v.paused) v.pause();
      }
    };
    const io = new IntersectionObserver(([e]) => {
      seen = !!e?.isIntersecting;
      sync();
    });
    io.observe(el);
    sync();
    return () => io.disconnect();
  }, [gate.motion, gate.paused, phase]);

  useEffect(() => {
    if (!gate.motion || !window.matchMedia('(pointer: fine)').matches) return;
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth) * 2 - 1);
      my.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [gate.motion, mx, my]);

  const video = 'absolute inset-0 size-full object-cover object-[60%_50%] lg:object-[6%_50%] transition-opacity duration-500';
  return (
    <div ref={box} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[46svh] overflow-hidden [mask-image:linear-gradient(to_bottom,black_58%,transparent_100%)] lg:inset-0 lg:h-auto lg:[mask-image:none]">
      <m.div style={gate.motion ? { transform, opacity } : undefined}
        // The push into the lens starts where the lens sits in each framing.
        className="absolute -inset-[3%] bg-[#0B0908] [transform-origin:40%_64%] lg:[transform-origin:53%_64%]">
        {(!gate.motion || phase === 'still') && <Still />}
        {gate.motion && (
          <>
            <video ref={intro} muted playsInline preload="auto" className={`${video} ${phase === 'intro' || phase === 'wait' ? 'opacity-100' : 'opacity-0'}`}>
              <source src={MEDIA.filmIntroWebm.url} type='video/webm; codecs="vp9"' />
              <source src={MEDIA.filmIntroMp4.url} type="video/mp4" />
            </video>
            <video ref={loop} muted playsInline loop preload="none" className={`${video} ${phase === 'loop' ? 'opacity-100' : 'opacity-0'}`}>
              <source src={MEDIA.filmLoopWebm.url} type='video/webm; codecs="vp9"' />
              <source src={MEDIA.filmLoopMp4.url} type="video/mp4" />
            </video>
          </>
        )}
      </m.div>
      {/* Atmosphere over the plate: haze that drifts, and the frame settling into the page's night. */}
      <div className="story-haze autoplay absolute inset-0 opacity-0 [html[data-motion='on']_&]:opacity-100" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_60%_45%,rgba(22,19,17,0)_40%,rgba(22,19,17,0.65)_100%)]" />
      {/* Phones: the film itself fades out at its foot (the mask), into whatever sky is behind. Desktop: into the page. */}
      <div className="absolute inset-x-0 bottom-0 hidden h-1/4 bg-gradient-to-b from-transparent to-[#161311] lg:block" />
      <div className="absolute inset-y-0 left-0 hidden w-[62%] bg-[linear-gradient(90deg,rgba(22,19,17,0.94)_0%,rgba(22,19,17,0.82)_32%,rgba(22,19,17,0.35)_62%,rgba(22,19,17,0)_100%)] lg:block" />
    </div>
  );
}
