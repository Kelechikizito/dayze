"use client";

import { useState } from "react";
import { useReducedMotion } from "@/hooks/useMotion";

/*
 * Full-bleed background for the hero.
 * Drop a muted loop at public/videos/hero.mp4 (and optionally a still at public/videos/hero.jpg).
 * Until then, or if it fails to load, a dark gradient stands in. With "reduce motion" on,
 * only the still (or the gradient) shows.
 */

const VIDEO_SRC = "/videos/hero.mp4";
const POSTER_SRC = "/videos/hero.jpg";

export function HeroVideo() {
  const reduced = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-gloss-black">
      {/* Stand-in art: ink with soft periwinkle and apricot light, like a dim studio */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 75% 30%, rgba(159,166,255,0.35), transparent 70%), radial-gradient(45% 40% at 20% 80%, rgba(255,179,106,0.25), transparent 70%), linear-gradient(180deg, #272b30 0%, #17150e 100%)",
        }}
      />

      {reduced && !posterFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={POSTER_SRC}
          alt=""
          onError={() => setPosterFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {!reduced && !failed && (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={posterFailed ? undefined : POSTER_SRC}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={VIDEO_SRC} type="video/mp4" onError={() => setFailed(true)} />
        </video>
      )}

      {/* Scrim: darkens the bottom-left so the white headline always reads */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(0deg, rgba(23,21,14,0.85) 0%, rgba(23,21,14,0.35) 45%, rgba(23,21,14,0.15) 100%), linear-gradient(90deg, rgba(23,21,14,0.55) 0%, transparent 60%)",
        }}
      />
    </div>
  );
}
