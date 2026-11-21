"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import type { MotionValue } from "motion/react";

/**
 * Glass bowl that fills with gold coins as payments come in, plus the winner on a pedestal.
 * - dropKey: increment to drop one coin into the bowl
 * - pouring: true runs the payout animation (coins arc from the bowl to the winner, bowl drains)
 */
const BX = 150; // bowl centre x
const RIM_Y = 96;
const A = 118; // bowl half width
const B = 132; // bowl depth
const BOTTOM = RIM_Y + B;
const WX = 452; // winner x
const WY = 150;

const halfWidthAt = (y: number) => A * Math.sqrt(Math.max(0, 1 - Math.pow((y - RIM_Y) / B, 2)));
const r2 = (n: number) => Math.round(n * 100) / 100;

function seeded(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const SURFACE_COINS = Array.from({ length: 22 }, (_, i) => ({ u: r2(seeded(i) * 2 - 1), v: r2(seeded(i + 40) * 2 - 1), t: r2(seeded(i + 80)) }));

export function BowlStage({
  progress,
  dropKey,
  pouring,
  paidOut,
  winnerLabel,
  winnerHue,
  onPoured,
}: {
  progress: number;
  dropKey: number;
  pouring: boolean;
  paidOut: boolean;
  winnerLabel: string;
  winnerHue: number;
  onPoured?: () => void;
}) {
  const reduce = useReducedMotion();
  const target = paidOut || pouring ? 0 : Math.min(1, Math.max(0, progress));
  const level = useMotionValue(target);
  const surfaceY = useTransform(level, (p) => BOTTOM - 6 - p * (B - 14));
  const massY = surfaceY;
  const surfRx = useTransform(surfaceY, (y) => halfWidthAt(y) - 3);
  const surfRy = useTransform(surfRx, (rx) => Math.max(2, rx * 0.2));
  const [drops, setDrops] = useState<number[]>([]);
  const [splash, setSplash] = useState<number[]>([]);

  useEffect(() => {
    const c = animate(level, target, { duration: pouring ? 2.4 : 0.9, ease: pouring ? [0.4, 0, 0.6, 1] : [0.16, 1, 0.3, 1], delay: pouring ? 0.25 : 0.45 });
    return () => c.stop();
  }, [target, pouring, level]);

  // queue a falling coin on each dropKey change
  useEffect(() => {
    if (!dropKey || reduce) return;
    const id = dropKey;
    const t0 = setTimeout(() => setDrops((d) => [...d, id]), 0);
    const t1 = setTimeout(() => {
      setDrops((d) => d.filter((x) => x !== id));
      setSplash((s) => [...s, id]);
    }, 650);
    const t2 = setTimeout(() => setSplash((s) => s.filter((x) => x !== id)), 1400);
    return () => [t0, t1, t2].forEach(clearTimeout);
  }, [dropKey, reduce]);

  useEffect(() => {
    if (!pouring) return;
    const t = setTimeout(() => onPoured?.(), 2900);
    return () => clearTimeout(t);
  }, [pouring, onPoured]);

  const full = target >= 1 && !pouring && !paidOut;
  const surfaceNow = BOTTOM - 6 - target * (B - 14);

  return (
    <svg viewBox="0 0 560 270" className="block h-auto w-full" role="img" aria-label="Collection bowl">
      <defs>
        <radialGradient id="bwGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="rgba(255,206,80,.55)" />
          <stop offset="1" stopColor="rgba(255,206,80,0)" />
        </radialGradient>
        <linearGradient id="bwMass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe17a" />
          <stop offset=".45" stopColor="#f2b21c" />
          <stop offset="1" stopColor="#9a5d00" />
        </linearGradient>
        <radialGradient id="bwSurf" cx="40%" cy="35%" r="75%">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset=".5" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#d48d06" />
        </radialGradient>
        <linearGradient id="bwGlass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="rgba(255,255,255,.28)" />
          <stop offset=".18" stopColor="rgba(255,255,255,.04)" />
          <stop offset=".75" stopColor="rgba(255,255,255,.02)" />
          <stop offset=".92" stopColor="rgba(255,255,255,.2)" />
          <stop offset="1" stopColor="rgba(255,255,255,.05)" />
        </linearGradient>
        <linearGradient id="bwRim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8f5200" />
          <stop offset=".3" stopColor="#ffe58a" />
          <stop offset=".55" stopColor="#f0a90a" />
          <stop offset=".8" stopColor="#fff1b0" />
          <stop offset="1" stopColor="#8f5200" />
        </linearGradient>
        <radialGradient id="coinG" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fff6c2" />
          <stop offset=".45" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#c27c00" />
        </radialGradient>
        <radialGradient id={`win${winnerHue}`} cx="35%" cy="28%" r="85%">
          <stop offset="0" stopColor={`hsl(${winnerHue},85%,82%)`} />
          <stop offset=".45" stopColor={`hsl(${winnerHue},70%,52%)`} />
          <stop offset="1" stopColor={`hsl(${winnerHue},70%,24%)`} />
        </radialGradient>
        <clipPath id="bwClip">
          <path d={`M${BX - A} ${RIM_Y} A${A} ${B} 0 0 0 ${BX + A} ${RIM_Y} Z`} />
          <ellipse cx={BX} cy={RIM_Y} rx={A} ry={24} />
        </clipPath>
        <filter id="bwSoft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* glow */}
      <motion.ellipse cx={BX} cy={170} rx={190} ry={120} fill="url(#bwGlow)" animate={{ opacity: full ? [0.55, 1, 0.55] : 0.35 }} transition={full ? { duration: 2, repeat: Infinity } : { duration: 0.6 }} />
      {/* table shadow */}
      <ellipse cx={BX} cy={BOTTOM + 22} rx={100} ry={10} fill="rgba(0,0,0,.28)" />

      {/* glass back */}
      <path d={`M${BX - A} ${RIM_Y} A${A} ${B} 0 0 0 ${BX + A} ${RIM_Y} Z`} fill="rgba(255,255,255,.035)" />
      <ellipse cx={BX} cy={RIM_Y} rx={A} ry={24} fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.18)" />

      {/* gold mass */}
      <g clipPath="url(#bwClip)">
        <motion.rect x={BX - A} width={A * 2} height={260} y={massY} fill="url(#bwMass)" />
        {/* coin rows on the side of the pile */}
        {Array.from({ length: 9 }, (_, i) => (
          <PileLine key={i} i={i} massY={massY} />
        ))}
        <motion.ellipse cx={BX} cy={surfaceY} rx={surfRx} ry={surfRy} fill="url(#bwSurf)" />
        {SURFACE_COINS.map((c, i) => (
          <SurfaceCoin key={i} c={c} surfRx={surfRx} surfRy={surfRy} surfaceY={surfaceY} level={level} />
        ))}
      </g>

      {/* falling coins */}
      <AnimatePresence>
        {drops.map((id) => (
          <motion.g key={id} initial={{ x: BX + ((id * 37) % 60) - 30, y: -30, opacity: 0 }} animate={{ y: surfaceNow - 4, opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.62, ease: [0.55, 0, 1, 0.45] }}>
            <motion.g animate={{ scaleX: [1, 0.15, 1, 0.15, 1] }} transition={{ duration: 0.62, ease: "linear" }}>
              <circle r={13} fill="url(#coinG)" stroke="#9a5d00" strokeWidth={1.2} />
              <circle r={9.5} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={0.9} />
              <text y={4.5} textAnchor="middle" fontSize="12" fontWeight="800" fill="#7a4a00">
                ₹
              </text>
            </motion.g>
          </motion.g>
        ))}
      </AnimatePresence>
      {/* splash sparkles */}
      <AnimatePresence>
        {splash.map((id) =>
          Array.from({ length: 8 }, (_, k) => {
            const ang = (k / 8) * Math.PI * 2;
            const sx = BX + ((id * 37) % 60) - 30;
            return (
              <motion.circle
                key={`${id}-${k}`}
                r={2.2}
                fill="#fff3b0"
                filter="url(#bwSoft)"
                initial={{ cx: sx, cy: surfaceNow - 4, opacity: 1 }}
                animate={{ cx: sx + Math.cos(ang) * 30, cy: surfaceNow - 4 + Math.sin(ang) * 14 - 14, opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            );
          }),
        )}
      </AnimatePresence>

      {/* glass front + rim */}
      <path d={`M${BX - A} ${RIM_Y} A${A} ${B} 0 0 0 ${BX + A} ${RIM_Y}`} fill="url(#bwGlass)" stroke="rgba(255,255,255,.28)" strokeWidth={1.4} />
      <path d={`M${BX - A + 16} ${RIM_Y + 30} Q ${BX - A + 22} ${RIM_Y + 90} ${BX - 40} ${BOTTOM - 14}`} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={4} strokeLinecap="round" />
      <ellipse cx={BX} cy={RIM_Y} rx={A} ry={24} fill="none" stroke="url(#bwRim)" strokeWidth={6} />
      <ellipse cx={BX} cy={RIM_Y - 1.5} rx={A - 3} ry={22} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth={1} />
      {/* stand */}
      <path d={`M${BX - 46} ${BOTTOM + 16} Q ${BX} ${BOTTOM - 6} ${BX + 46} ${BOTTOM + 16}`} fill="url(#bwRim)" />
      <ellipse cx={BX} cy={BOTTOM + 16} rx={46} ry={7} fill="url(#bwRim)" />

      {/* path to the winner */}
      <path d={`M${BX + 40} ${RIM_Y - 10} Q ${(BX + WX) / 2} ${-10} ${WX} ${WY - 40}`} fill="none" stroke="rgba(255,211,77,.22)" strokeWidth={2} strokeDasharray="3 8" />

      {/* pour animation: coins arc to the winner */}
      {pouring &&
        !reduce &&
        Array.from({ length: 16 }, (_, i) => (
          <motion.g
            key={i}
            initial={{ x: BX + 20 + (i % 4) * 8, y: RIM_Y + 6, opacity: 0, scale: 0.8 }}
            animate={{ x: [BX + 20 + (i % 4) * 8, (BX + WX) / 2, WX], y: [RIM_Y + 6, 4 + (i % 3) * 10, WY - 10], opacity: [0, 1, 1, 0], scale: [0.8, 1.1, 0.6] }}
            transition={{ duration: 1.05, delay: 0.2 + i * 0.12, ease: "easeInOut", times: [0, 0.5, 1] }}
          >
            <circle r={10} fill="url(#coinG)" stroke="#9a5d00" strokeWidth={1} />
            <text y={3.6} textAnchor="middle" fontSize="10" fontWeight="800" fill="#7a4a00">
              ₹
            </text>
          </motion.g>
        ))}

      {/* winner pedestal */}
      <ellipse cx={WX} cy={WY + 64} rx={64} ry={12} fill="rgba(0,0,0,.25)" />
      <path d={`M${WX - 56} ${WY + 40} L${WX - 46} ${WY + 64} L${WX + 46} ${WY + 64} L${WX + 56} ${WY + 40} Z`} fill="url(#bwRim)" opacity={0.9} />
      <ellipse cx={WX} cy={WY + 40} rx={56} ry={10} fill="url(#bwRim)" />
      <motion.g animate={paidOut ? { scale: [1, 1.12, 1] } : {}} transition={{ duration: 0.6 }}>
        <circle cx={WX} cy={WY} r={34} fill={`url(#win${winnerHue})`} />
        <circle cx={WX} cy={WY - 7} r={9} fill="rgba(255,255,255,.93)" />
        <ellipse cx={WX} cy={WY + 19} rx={18} ry={13} fill="rgba(255,255,255,.93)" />
        <ellipse cx={WX - 11} cy={WY - 18} rx={12} ry={5.5} fill="rgba(255,255,255,.5)" transform={`rotate(-30 ${WX - 11} ${WY - 18})`} />
        <circle cx={WX} cy={WY} r={40} fill="none" stroke={paidOut ? "#43d68a" : "#ffd34d"} strokeWidth={2.5} strokeDasharray={paidOut ? "0" : "5 6"} filter="url(#bwSoft)" />
        <path d={`M${WX - 10} ${WY - 44} L${WX - 6} ${WY - 54} L${WX} ${WY - 47} L${WX + 6} ${WY - 54} L${WX + 10} ${WY - 44} Z`} fill="#ffd34d" stroke="#8f5200" strokeWidth={0.8} />
      </motion.g>
      <text x={WX} y={WY + 96} textAnchor="middle" fontSize="14" fontWeight="800" fill="currentColor">
        {winnerLabel}
      </text>
    </svg>
  );
}

function PileLine({ i, massY }: { i: number; massY: MotionValue<number> }) {
  const y = useTransform(massY, (v) => v + 16 + i * 14);
  return <motion.path d={`M${BX - A} 0 Q ${BX} 14 ${BX + A} 0`} fill="none" stroke="rgba(120,70,0,.35)" strokeWidth={1.2} style={{ y }} />;
}

function SurfaceCoin({
  c,
  surfRx,
  surfRy,
  surfaceY,
  level,
}: {
  c: { u: number; v: number };
  surfRx: MotionValue<number>;
  surfRy: MotionValue<number>;
  surfaceY: MotionValue<number>;
  level: MotionValue<number>;
}) {
  const cx = useTransform(surfRx, (rx) => BX + c.u * rx * 0.82);
  const cy = useTransform(() => surfaceY.get() + c.v * surfRy.get() * 0.7);
  const opacity = useTransform(level, (p) => (p > 0.03 ? 0.95 : 0));
  return <motion.ellipse rx={7} ry={2.6} fill="url(#coinG)" stroke="rgba(140,80,0,.55)" strokeWidth={0.6} cx={cx} cy={cy} opacity={opacity} />;
}
