import { useState, useMemo } from 'react';
import { Source } from '../types';
import type { ChunkNode, RetrievalHighlight } from '../types/vectorMap';
import { ChunkMap } from './ChunkMap';

interface Props {
  chunks: Source[];
  allNodes?: ChunkNode[];
  topK?: number;
  queryCoordinate?: { x: number; y: number; document_id: string };
}

export function RetrievalVisualizer({ chunks, allNodes, topK = 3, queryCoordinate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeChunk, setActiveChunk] = useState<string | null>(null);
  const [hoveredChunk, setHoveredChunk] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...chunks].sort((a, b) => b.similarity - a.similarity),
    [chunks]
  );
  const maxSim = sorted[0]?.similarity ?? 0;
  const topIds = new Set(sorted.slice(0, topK).map((c) => c.id));

  const highlights: RetrievalHighlight[] = useMemo(
    () =>
      sorted.map((c, i) => ({
        chunk_id: c.id,
        similarity_score: c.similarity,
        rank: i + 1,
      })),
    [sorted]
  );

  const displayChunkId = activeChunk || hoveredChunk;
  const displayChunk = displayChunkId
    ? chunks.find((c) => c.id === displayChunkId)
    : null;

  if (!chunks.length) return null;

  return (
    <div className="mt-2 text-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
      >
        <span>Sources · {chunks.length}</span>
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur p-4">
          {/* Map */}
          <div className="w-full aspect-square rounded-lg overflow-hidden bg-[#0A0B0F]">
            {allNodes && allNodes.length > 0 ? (
              <ChunkMap
                nodes={allNodes}
                highlights={highlights}
                onChunkHover={setHoveredChunk}
                queryCoordinate={queryCoordinate}
                className="w-full h-full"
              />
            ) : (
              <ChunkMap
                nodes={chunks.map((c) => ({
                  chunk_id: c.id,
                  chunk_index: c.chunk_index,
                  text_content: c.content_snippet,
                  x_coordinate: c.x_coordinate ?? 0,
                  y_coordinate: c.y_coordinate ?? 0,
                }))}
                highlights={highlights}
                onChunkHover={setHoveredChunk}
                queryCoordinate={queryCoordinate}
                className="w-full h-full"
              />
            )}
          </div>

          {/* Ranked list */}
          <div className="space-y-1.5">
            {sorted.map((c) => (
              <div
                key={c.id}
                onClick={() =>
                  setActiveChunk(c.id === activeChunk ? null : c.id)
                }
                className={`flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer border-l-2 ${
                  topIds.has(c.id)
                    ? 'border-[#FF7A6E] bg-[#FF7A6E]/10'
                    : 'border-transparent'
                }`}
              >
                <span className="text-[10px] font-mono text-white/40 w-6">
                  C{c.chunk_index}
                </span>
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#8C7FF5] to-[#FF7A6E] rounded-full"
                    style={{
                      width: `${maxSim ? (c.similarity / maxSim) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-white/40 w-10 text-right">
                  {c.similarity.toFixed(3)}
                </span>
              </div>
            ))}
          </div>

          {/* Hover/active chunk preview */}
          {displayChunk && (
            <div className="sm:col-span-2 text-xs text-white/60 bg-black/20 rounded-lg p-3 leading-relaxed">
              {displayChunk.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
