import { useRef, useEffect, useCallback } from 'react';
import type { ChunkNode, RetrievalHighlight } from '../types/vectorMap';

interface Props {
  nodes: ChunkNode[];
  highlights?: RetrievalHighlight[];
  onChunkHover?: (chunkId: string | null) => void;
  queryCoordinate?: { x: number; y: number; document_id: string };
  className?: string;
}

const IDLE_DOT = '#3F4451';
const HIT_DOT = '#6366F1';
const TOP_DOT = '#F59E0B';
const CENTER_GLOW = 'rgba(99, 102, 241, 0.15)';
const LINE_COLOR = 'rgba(99, 102, 241, 0.4)';
const LABEL_COLOR = '#6B7280';
const QUERY_DOT = '#22D3EE';
const QUERY_GLOW = 'rgba(34, 211, 238, 0.25)';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function ChunkMap({ nodes, highlights = [], onChunkHover, queryCoordinate, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredRef = useRef<string | null>(null);
  const animRef = useRef({ entrance: 1, pulseTime: 0, pulseActive: false });
  const drawRef = useRef<() => void>();

  const highlightMap = new Map(highlights.map((h) => [h.chunk_id, h]));
  const topId = highlights.find((h) => h.rank === 1)?.chunk_id;

  // Query reference point — defaults to (0,0) which was the old center
  const qx = queryCoordinate?.x ?? 0;
  const qy = queryCoordinate?.y ?? 0;
  const hasQueryPoint = queryCoordinate !== undefined;

  // Shared coordinate mapping helpers
  function getBounds() {
    const xs = nodes.map((n) => n.x_coordinate);
    const ys = nodes.map((n) => n.y_coordinate);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    return { xMin, xMax, yMin, yMax, xSpan: xMax - xMin || 1, ySpan: yMax - yMin || 1 };
  }

  function mapX(v: number, w: number, pad: number, bounds: ReturnType<typeof getBounds>) {
    return pad + ((v - bounds.xMin) / bounds.xSpan) * (w - pad * 2);
  }

  function mapY(v: number, h: number, pad: number, bounds: ReturnType<typeof getBounds>) {
    return pad + ((v - bounds.yMin) / bounds.ySpan) * (h - pad * 2);
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    if (!nodes.length) return;

    const bounds = getBounds();
    const pad = 40;
    const mx = (v: number) => mapX(v, w, pad, bounds);
    const my = (v: number) => mapY(v, h, pad, bounds);

    // Query / center position on canvas
    const cx = mx(qx);
    const cy = my(qy);

    const anim = animRef.current;
    const entrances = anim.entrance;

    const R = 5;

    // ── Constellation connection lines — top hit to query point ──
    if (topId) {
      const top = nodes.find((n) => n.chunk_id === topId);
      if (top) {
        const tx = entrances < 1 ? mx(qx + (top.x_coordinate - qx) * entrances) : mx(top.x_coordinate);
        const ty = entrances < 1 ? my(qy + (top.y_coordinate - qy) * entrances) : my(top.y_coordinate);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // Lines from center to other highlighted chunks
    for (const hl of highlights) {
      if (hl.chunk_id === topId) continue;
      const node = nodes.find((n) => n.chunk_id === hl.chunk_id);
      if (!node) continue;
      const nx = entrances < 1 ? mx(qx + (node.x_coordinate - qx) * entrances) : mx(node.x_coordinate);
      const ny = entrances < 1 ? my(qy + (node.y_coordinate - qy) * entrances) : my(node.y_coordinate);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // ── Query point glow ──
    if (hasQueryPoint || queryCoordinate === undefined) {
      const qGlow = hasQueryPoint ? QUERY_GLOW : CENTER_GLOW;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
      grad.addColorStop(0, qGlow);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Query point marker (diamond) ──
    if (hasQueryPoint) {
      const qs = 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - qs);
      ctx.lineTo(cx + qs, cy);
      ctx.lineTo(cx, cy + qs);
      ctx.lineTo(cx - qs, cy);
      ctx.closePath();
      ctx.fillStyle = QUERY_DOT;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#9CA3AF';
      ctx.font = '8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Query', cx, cy + qs + 12);
    } else {
      // Old-style center dot
      ctx.fillStyle = TOP_DOT;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Chunk dots ──
    for (const node of nodes) {
      const rawX = node.x_coordinate;
      const rawY = node.y_coordinate;
      const x = entrances < 1 ? mx(qx + (rawX - qx) * entrances) : mx(rawX);
      const y = entrances < 1 ? my(qy + (rawY - qy) * entrances) : my(rawY);
      const hl = highlightMap.get(node.chunk_id);
      const isHovered = hoveredRef.current === node.chunk_id;

      let color = IDLE_DOT;
      if (hl) {
        color = node.chunk_id === topId ? TOP_DOT : HIT_DOT;
      }

      ctx.beginPath();
      ctx.arc(x, y, isHovered ? R + 2 : R, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = hl ? 1 : 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHovered) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Chunk index label
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`C${node.chunk_index}`, x, y - R - 4);
    }

    // ── Pulse rings on highlighted chunks ──
    if (anim.pulseActive && anim.pulseTime < 1) {
      const pt = anim.pulseTime;
      for (const hl of highlights) {
        const node = nodes.find((n) => n.chunk_id === hl.chunk_id);
        if (!node) continue;
        const px = entrances < 1 ? mx(qx + (node.x_coordinate - qx) * entrances) : mx(node.x_coordinate);
        const py = entrances < 1 ? my(qy + (node.y_coordinate - qy) * entrances) : my(node.y_coordinate);
        const radius = pt * 28;
        const alpha = 1 - pt;

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha * 0.6})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(px, py, radius * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(245, 158, 11, ${alpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }, [nodes, highlights, topId, qx, qy, hasQueryPoint]);

  drawRef.current = draw;

  // ── Entrance animation ──
  useEffect(() => {
    animRef.current.entrance = 0;
    const duration = 600;
    const start = performance.now();
    let frame: number;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      animRef.current.entrance = easeOutCubic(t);
      drawRef.current?.();
      if (t < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [nodes]);

  // ── Pulse animation on new highlights ──
  useEffect(() => {
    if (highlights.length === 0) return;
    animRef.current.pulseActive = true;
    animRef.current.pulseTime = 0;
    const duration = 1200;
    const start = performance.now();
    let frame: number;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      animRef.current.pulseTime = t;
      drawRef.current?.();
      if (t < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        animRef.current.pulseActive = false;
        drawRef.current?.();
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [highlights]);

  // ── Resize handler ──
  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  // ── Mouse interaction ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (!nodes.length) return;

      const bounds = getBounds();
      const pad = 40;
      const w = rect.width;
      const h = rect.height;
      const mapXv = (v: number) => pad + ((v - bounds.xMin) / bounds.xSpan) * (w - pad * 2);
      const mapYv = (v: number) => pad + ((v - bounds.yMin) / bounds.ySpan) * (h - pad * 2);

      const hitR = 8;
      let hit: string | null = null;

      const anim = animRef.current;
      const entrances = anim.entrance;

      for (const node of nodes) {
        const rawX = node.x_coordinate;
        const rawY = node.y_coordinate;
        const nodeX = entrances < 1 ? mapXv(qx + (rawX - qx) * entrances) : mapXv(rawX);
        const nodeY = entrances < 1 ? mapYv(qy + (rawY - qy) * entrances) : mapYv(rawY);
        const dx = mx - nodeX;
        const dy = my - nodeY;
        if (dx * dx + dy * dy < hitR * hitR) {
          hit = node.chunk_id;
          break;
        }
      }

      if (hit !== hoveredRef.current) {
        hoveredRef.current = hit;
        onChunkHover?.(hit);
        draw();
      }
    },
    [nodes, onChunkHover, draw, qx, qy]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoveredRef.current !== null) {
      hoveredRef.current = null;
      onChunkHover?.(null);
      draw();
    }
  }, [onChunkHover, draw]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    />
  );
}
