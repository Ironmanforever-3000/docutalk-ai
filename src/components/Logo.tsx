import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface LogoProps {
  /** px size of the mark (square). Default 40. */
  size?: number;
  /** Play the draw-in animation on mount. Default false. */
  animated?: boolean;
  /** Extra Tailwind / CSS classes on the wrapper. */
  className?: string;
  /** Called when the entrance animation completes. */
  onComplete?: () => void;
}

/**
 * DocuTalk AI logomark
 *
 * A document outline (rectangle + folded top-right corner) with a three-node
 * graph drawn inside it: two source nodes connected to a central hub node via
 * spoke lines, representing a RAG pipeline reading / connecting data.
 *
 * Animated variant: GSAP stroke-dashoffset draw-in, respects
 * prefers-reduced-motion (skips animation when enabled).
 */
export default function Logo({
  size = 40,
  animated = false,
  className = '',
  onComplete,
}: LogoProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!animated || !svgRef.current) return;

    const prefersReduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const svg = svgRef.current;

    // All stroked paths & circles we'll animate
    const docOutline  = svg.querySelector<SVGPathElement>('#logo-doc');
    const fold        = svg.querySelector<SVGPathElement>('#logo-fold');
    const lineA       = svg.querySelector<SVGLineElement>('#logo-line-a');
    const lineB       = svg.querySelector<SVGLineElement>('#logo-line-b');
    const nodeHub     = svg.querySelector<SVGCircleElement>('#logo-hub');
    const nodeA       = svg.querySelector<SVGCircleElement>('#logo-node-a');
    const nodeB       = svg.querySelector<SVGCircleElement>('#logo-node-b');

    if (!docOutline || !fold || !lineA || !lineB || !nodeHub || !nodeA || !nodeB) return;

    if (prefersReduced) {
      // Skip animation — jump to final state
      gsap.set([docOutline, fold, lineA, lineB, nodeHub, nodeA, nodeB], {
        opacity: 1,
        strokeDashoffset: 0,
        scale: 1,
      });
      onComplete?.();
      return;
    }

    // Helper: prep a stroked element for dash-offset draw-in
    const prep = (el: SVGGeometryElement) => {
      const len = el.getTotalLength?.() ?? 60;
      gsap.set(el, {
        strokeDasharray: len,
        strokeDashoffset: len,
        opacity: 1,
      });
      return len;
    };

    prep(docOutline);
    prep(fold);
    const lineALen = lineA.getTotalLength?.() ?? 20;
    const lineBLen = lineB.getTotalLength?.() ?? 20;

    gsap.set(lineA, { strokeDasharray: lineALen, strokeDashoffset: lineALen, opacity: 1 });
    gsap.set(lineB, { strokeDasharray: lineBLen, strokeDashoffset: lineBLen, opacity: 1 });
    gsap.set([nodeHub, nodeA, nodeB], { scale: 0, transformOrigin: 'center', opacity: 1 });

    const tl = gsap.timeline({ onComplete: () => onComplete?.() });

    // 1. Document outline draws in
    tl.to(docOutline, {
      strokeDashoffset: 0,
      duration: 0.45,
      ease: 'power2.out',
    });

    // 2. Fold corner draws in (overlapping slightly)
    tl.to(fold, {
      strokeDashoffset: 0,
      duration: 0.2,
      ease: 'power2.out',
    }, '-=0.15');

    // 3. Connector lines draw in
    tl.to([lineA, lineB], {
      strokeDashoffset: 0,
      duration: 0.22,
      ease: 'power2.out',
      stagger: 0.06,
    }, '-=0.05');

    // 4. Nodes pop in with scale
    tl.to([nodeHub, nodeA, nodeB], {
      scale: 1,
      duration: 0.18,
      ease: 'back.out(2.5)',
      stagger: 0.07,
    }, '-=0.1');

    return () => { tl.kill(); };
  }, [animated, onComplete]);

  // Viewbox: 0 0 32 36 — document proportioned canvas
  // Document path: main rect with folded top-right corner (7px fold)
  // Fold: the small triangular corner crease
  // Graph: hub node at centre, two source nodes, two spoke lines

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size * (36 / 32)}
      viewBox="0 0 32 36"
      fill="none"
      aria-label="DocuTalk AI logomark"
      className={className}
      role="img"
    >
      {/* ── Document outline ─────────────────────────────────────────── */}
      {/* Main body: bottom-left, bottom-right, top-right-after-fold, fold point */}
      <path
        id="logo-doc"
        d="M3 35 L3 1 L21 1 L29 9 L29 35 Z"
        stroke="#FF6A3D"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
        opacity={animated ? 0 : 1}
      />

      {/* Fold crease */}
      <path
        id="logo-fold"
        d="M21 1 L21 9 L29 9"
        stroke="#FF6A3D"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
        opacity={animated ? 0 : 1}
      />

      {/* ── Graph inside the document ─────────────────────────────── */}
      {/* Hub node — centre of document body */}
      <circle
        id="logo-hub"
        cx="16"
        cy="22"
        r="3"
        fill="#FF6A3D"
        opacity={animated ? 0 : 1}
      />

      {/* Source node A — upper-left */}
      <circle
        id="logo-node-a"
        cx="9"
        cy="15"
        r="2"
        fill="#FF8F63"
        opacity={animated ? 0 : 1}
      />

      {/* Source node B — upper-right */}
      <circle
        id="logo-node-b"
        cx="23"
        cy="15"
        r="2"
        fill="#FF8F63"
        opacity={animated ? 0 : 1}
      />

      {/* Connector: node A → hub */}
      <line
        id="logo-line-a"
        x1="10.5"
        y1="16.5"
        x2="14"
        y2="20.5"
        stroke="#FF6A3D"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity={animated ? 0 : 1}
      />

      {/* Connector: node B → hub */}
      <line
        id="logo-line-b"
        x1="21.5"
        y1="16.5"
        x2="18"
        y2="20.5"
        stroke="#FF6A3D"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity={animated ? 0 : 1}
      />
    </svg>
  );
}
