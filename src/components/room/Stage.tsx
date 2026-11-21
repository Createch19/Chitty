"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { inr } from "@/lib/money";

export type StageSeat = { label: string; hue: number; state: "off" | "on" | "won" };
export type StageHandle = {
  /** Electric bolt from a seat into the orb (or orb → seat when reverse). Resolves when it hits. */
  bolt: (index: number, reverse?: boolean) => Promise<void>;
};

const NS = "http://www.w3.org/2000/svg";
const CX = 200;
const CY = 205;
const ORB = 50;
const RING = 146;

/** Round so server and browser render identical numbers (no hydration mismatch). */
const r2 = (n: number) => Math.round(n * 100) / 100;

function rand(seed: number) {
  const x = Math.sin(seed * 9301.17 + 49297.3) * 233280;
  return x - Math.floor(x);
}

export function Stage({
  ref,
  seats,
  me,
  leader,
  pick,
  price,
  topLabel,
  prizeLabel,
  ariaLabel,
  onSeatClick,
}: {
  ref?: Ref<StageHandle>;
  onSeatClick?: (index: number) => void;
  seats: StageSeat[];
  me: number | null;
  leader: number | null;
  pick: number | null;
  price: number;
  topLabel: string;
  prizeLabel: string;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boltRef = useRef<SVGGElement>(null);
  const waveRef = useRef<SVGGElement>(null);
  const orbRef = useRef<SVGGElement>(null);
  const priceMv = useMotionValue(price);
  const priceText = useTransform(priceMv, (v) => inr(Math.round(v)));
  const avRefs = useRef<(SVGGElement | null)[]>([]);

  const N = seats.length;
  const rad = r2(Math.max(13, Math.min(23, ((Math.PI * RING) / N) * 0.8)));
  const pos = seats.map((_, j) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * j) / N;
    return { x: r2(CX + RING * Math.cos(ang)), y: r2(CY + RING * Math.sin(ang)), ang };
  });

  // Count the price up whenever it changes (after the bolt lands).
  useEffect(() => {
    if (priceMv.get() === price || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      priceMv.set(price);
      return;
    }
    const c = animate(priceMv, price, { duration: 0.75, ease: [0.33, 1, 0.68, 1] });
    return () => c.stop();
  }, [price, priceMv]);

  useImperativeHandle(
    ref,
    () => ({
      bolt(index, reverse = false) {
        return new Promise<void>((resolve) => {
          const layer = boltRef.current;
          const p = pos[index];
          if (!layer || !p || matchMedia("(prefers-reduced-motion: reduce)").matches) return resolve();
          const dx = CX - p.x;
          const dy = CY - p.y;
          const len = Math.hypot(dx, dy);
          const ux = dx / len;
          const uy = dy / len;
          const nx = -uy;
          const ny = ux;
          const ax = p.x + ux * (rad + 2);
          const ay = p.y + uy * (rad + 2);
          const bx = CX - ux * (ORB + 1);
          const by = CY - uy * (ORB + 1);
          const [sx, sy, ex, ey] = reverse ? [bx, by, ax, ay] : [ax, ay, bx, by];
          const pts: [number, number][] = [[sx, sy]];
          for (let i = 1; i < 11; i++) {
            const tt = i / 11;
            const off = (Math.random() - 0.5) * 17;
            pts.push([sx + (ex - sx) * tt + nx * off, sy + (ey - sy) * tt + ny * off]);
          }
          pts.push([ex, ey]);
          const d = "M" + pts.map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" L");
          const col = reverse ? "#7dffb0" : "#6ff0ff";
          const mk = (attrs: Record<string, string | number>) => {
            const e = document.createElementNS(NS, attrs.tag as string) as SVGGeometryElement;
            for (const k in attrs) if (k !== "tag") e.setAttribute(k, String(attrs[k]));
            layer.appendChild(e);
            return e;
          };
          const glow = mk({ tag: "path", d, fill: "none", stroke: col, "stroke-width": 9, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.55, filter: "url(#fGlow)" });
          const core = mk({ tag: "path", d, fill: "none", stroke: "#fff", "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" });
          const spark = mk({ tag: "circle", r: 5.5, fill: "#fff", filter: "url(#fGlow)" });
          const L = core.getTotalLength();
          for (const q of [glow, core]) {
            q.style.strokeDasharray = String(L);
            q.style.strokeDashoffset = String(L);
          }
          const av = avRefs.current[index];
          if (!reverse && av) {
            av.classList.add("zap");
            setTimeout(() => av.classList.remove("zap"), 700);
          }
          const t0 = performance.now();
          const travel = reverse ? 420 : 520;
          const fade = 380;
          let hit = false;
          const f = (now: number) => {
            const el = now - t0;
            if (el < travel) {
              const pe = 1 - Math.pow(1 - el / travel, 2);
              glow.style.strokeDashoffset = core.style.strokeDashoffset = String(L * (1 - pe));
              const pt = core.getPointAtLength(L * pe);
              spark.setAttribute("cx", String(pt.x));
              spark.setAttribute("cy", String(pt.y));
              glow.setAttribute("opacity", String(0.35 + Math.random() * 0.45));
              requestAnimationFrame(f);
              return;
            }
            if (!hit) {
              hit = true;
              spark.remove();
              glow.style.strokeDashoffset = core.style.strokeDashoffset = "0";
              if (!reverse) {
                const orb = orbRef.current;
                if (orb) {
                  orb.classList.remove("hit");
                  void orb.getBoundingClientRect();
                  orb.classList.add("hit");
                }
                const w = document.createElementNS(NS, "circle");
                for (const [k, v] of Object.entries({ cx: CX, cy: CY, r: ORB, fill: "none", stroke: "#6ff0ff", "stroke-width": 3, class: "wavec" })) w.setAttribute(k, String(v));
                waveRef.current?.appendChild(w);
                setTimeout(() => w.remove(), 820);
              } else if (av) {
                av.classList.remove("pop");
                void av.getBoundingClientRect();
                av.classList.add("pop");
                setTimeout(() => av.classList.remove("pop"), 800);
              }
              resolve();
            }
            const fp = Math.min(1, (el - travel) / fade);
            glow.setAttribute("opacity", String(0.6 * (1 - fp)));
            core.setAttribute("opacity", String(1 - fp));
            if (fp < 1) requestAnimationFrame(f);
            else {
              glow.remove();
              core.remove();
            }
          };
          requestAnimationFrame(f);
        });
      },
    }),
    // positions only change with the seat count
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [N, rad],
  );

  // Gentle 3D tilt that follows the pointer.
  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const r = wrap.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      svg.style.transform = `rotateX(${(-dy * 7).toFixed(2)}deg) rotateY(${(dx * 7).toFixed(2)}deg)`;
    };
    const leave = () => (svg.style.transform = "");
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerleave", leave);
    return () => {
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerleave", leave);
    };
  }, []);

  const stars = Array.from({ length: 34 }, (_, i) => ({ x: r2(rand(i) * 400), y: r2(rand(i + 99) * 400), r: r2(0.4 + rand(i + 7) * 1.1), d: r2(rand(i + 3) * 2.8) }));

  return (
    <div ref={wrapRef} className="stage-wrap">
      <svg ref={svgRef} viewBox="0 0 400 400" className="stage-svg" role="img" aria-label={ariaLabel}>
        <defs>
          <radialGradient id="gBg" cx="50%" cy="50%" r="72%">
            <stop offset="0" stopColor="#2a1f4a" />
            <stop offset="0.55" stopColor="#140f26" />
            <stop offset="1" stopColor="#07060d" />
          </radialGradient>
          <radialGradient id="gFloor" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="rgba(255,211,77,.18)" />
            <stop offset="1" stopColor="rgba(255,211,77,0)" />
          </radialGradient>
          <radialGradient id="gGold" cx="35%" cy="28%" r="80%">
            <stop offset="0" stopColor="#fff6c2" />
            <stop offset="0.35" stopColor="#ffd34d" />
            <stop offset="0.75" stopColor="#e39a05" />
            <stop offset="1" stopColor="#8f5200" />
          </radialGradient>
          <radialGradient id="gGrey" cx="35%" cy="28%" r="80%">
            <stop offset="0" stopColor="#cfd6da" />
            <stop offset="0.6" stopColor="#8b959b" />
            <stop offset="1" stopColor="#4f585d" />
          </radialGradient>
          <filter id="fGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="fSh" x="-40%" y="-40%" width="180%" height="190%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#000" floodOpacity="0.55" />
          </filter>
          {seats.map((s, i) => (
            <radialGradient key={i} id={`gA${i}`} cx="35%" cy="28%" r="85%">
              <stop offset="0" stopColor={`hsl(${s.hue},85%,82%)`} />
              <stop offset="0.45" stopColor={`hsl(${s.hue},70%,52%)`} />
              <stop offset="1" stopColor={`hsl(${s.hue},70%,24%)`} />
            </radialGradient>
          ))}
        </defs>

        <rect width="400" height="400" rx="26" fill="url(#gBg)" />
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" className="spark-dot" style={{ animationDelay: `${-s.d}s` }} />
        ))}
        <ellipse cx={CX} cy={CY} rx={170} ry={170} fill="url(#gFloor)" />
        <circle cx={CX} cy={CY} r={RING} fill="none" stroke="rgba(255,255,255,.07)" strokeDasharray="2 6" />
        <circle cx={CX} cy={CY} r={98} fill="none" stroke="rgba(255,255,255,.05)" />

        <g>
          {seats.map((s, j) => {
            const p = pos[j];
            const ux = (CX - p.x) / RING;
            const uy = (CY - p.y) / RING;
            const cls = "wire " + (s.state === "won" ? "won" : s.state === "on" ? "on" : "off") + (leader === j ? " lead" : "");
            return (
              <line key={j} x1={r2(p.x + ux * rad)} y1={r2(p.y + uy * rad)} x2={r2(CX - ux * (ORB + 2))} y2={r2(CY - uy * (ORB + 2))} className={cls} strokeLinecap="round" />
            );
          })}
        </g>

        <g>
          {seats.map((s, j) => {
            const p = pos[j];
            const ca = Math.cos(p.ang);
            const sa = Math.sin(p.ang);
            const side = ca > 0.35 ? "start" : ca < -0.35 ? "end" : "middle";
            const ro = rad + (side === "middle" ? 11 : 6);
            const cls = "av " + s.state + (leader === j ? " lead" : "") + (me === j ? " me" : "") + (pick === j ? " pick" : "");
            return (
              <g
                key={j}
                ref={(el) => void (avRefs.current[j] = el)}
                className={cls}
                transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
                onClick={onSeatClick ? () => onSeatClick(j) : undefined}
                style={onSeatClick && s.state !== "won" ? { cursor: "pointer" } : undefined}
              >
                <g className="bob" style={{ animationDelay: `${(-(j * 0.37) % 3.4).toFixed(2)}s` }}>
                  <g className="zp">
                    <ellipse cx={0} cy={rad + 3} rx={rad * 0.8} ry={rad * 0.18} fill="rgba(0,0,0,.35)" />
                    <circle r={rad} fill={s.state === "on" ? `url(#gA${j})` : "url(#gGrey)"} filter="url(#fSh)" />
                    <circle r={rad} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={1} />
                    <circle cx={0} cy={-rad * 0.2} r={rad * 0.26} fill="rgba(255,255,255,.93)" />
                    <ellipse cx={0} cy={rad * 0.58} rx={rad * 0.54} ry={rad * 0.38} fill="rgba(255,255,255,.93)" />
                    <ellipse cx={-rad * 0.32} cy={-rad * 0.52} rx={rad * 0.34} ry={rad * 0.17} fill="rgba(255,255,255,.55)" transform={`rotate(-30 ${-rad * 0.32} ${-rad * 0.52})`} />
                    <circle r={rad + 3.5} fill="none" stroke="#ffd34d" strokeWidth={2.5} className="lead-ring" filter="url(#fGlow)" />
                    <circle r={rad + 4.5} fill="none" stroke="#7dffb0" strokeWidth={2.5} className="pick-ring" filter="url(#fGlow)" />
                    <circle r={rad + 3.5} fill="none" stroke="#fff" strokeWidth={1.6} strokeDasharray="4 3" className="me-ring" />
                    <path
                      className="crown"
                      d={`M-7.5,-${rad + 4} L-5,-${rad + 12} L-2,-${rad + 7} L0,-${rad + 13} L2,-${rad + 7} L5,-${rad + 12} L7.5,-${rad + 4} Z`}
                      fill="#ffd34d"
                      stroke="#8f5200"
                      strokeWidth={0.8}
                      filter="url(#fGlow)"
                    />
                    <g className="won-mark">
                      <circle cx={rad * 0.7} cy={-rad * 0.7} r={6.5} fill="#1d1830" stroke="rgba(255,211,77,.7)" strokeWidth={1} />
                      <text x={rad * 0.7} y={-rad * 0.7 + 3} textAnchor="middle" fontSize="8" fill="#ffd34d">
                        ✓
                      </text>
                    </g>
                  </g>
                </g>
                <text x={(ca * ro).toFixed(1)} y={(sa * ro + 3).toFixed(1)} textAnchor={side} className="idl">
                  {s.label}
                </text>
              </g>
            );
          })}
        </g>

        <g ref={boltRef} />

        <g>
          <g ref={waveRef} />
          <g ref={orbRef} className="orb">
            <circle cx={CX} cy={CY} r={ORB + 15} fill="none" stroke="rgba(255,211,77,.28)" strokeWidth={1} strokeDasharray="1 5" className="orb-ring-2" />
            <circle cx={CX} cy={CY} r={ORB + 10} fill="none" stroke="rgba(255,211,77,.55)" strokeWidth={1.5} strokeDasharray="3 7" className="orb-ring" />
            <circle cx={CX} cy={CY} r={ORB + 4} fill="rgba(255,200,60,.2)" className="orb-glow" filter="url(#fGlow)" />
            <circle cx={CX} cy={CY} r={ORB} fill="url(#gGold)" filter="url(#fSh)" />
            <circle cx={CX} cy={CY} r={ORB - 4} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth={1.2} />
            <ellipse cx={CX - 16} cy={CY - 29} rx={21} ry={9} fill="rgba(255,255,255,.55)" transform={`rotate(-25 ${CX - 16} ${CY - 29})`} />
            <text x={CX} y={CY - 14} textAnchor="middle" className="orb-sm">
              {topLabel}
            </text>
            <motion.text x={CX} y={CY + 6} textAnchor="middle" className="orb-big tabular">
              {priceText}
            </motion.text>
            <text x={CX} y={CY + 22} textAnchor="middle" className="orb-prize">
              {prizeLabel}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
