import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { ChunkNode } from '../types/vectorMap';

export function useDocumentChunkMap(documentId: string | null) {
  const [nodes, setNodes] = useState<ChunkNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!documentId) return;

    let cancelled = false;
    setLoading(true);

    supabase
      .from('document_chunks')
      .select('id, content, x_coordinate, y_coordinate, chunk_index')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load chunk map:', error);
          setNodes([]);
        } else {
          setNodes(
            (data ?? []).map((row) => ({
              chunk_id: row.id,
              text_content: (row.content as string).slice(0, 200),
              x_coordinate: row.x_coordinate as number,
              y_coordinate: row.y_coordinate as number,
              chunk_index: row.chunk_index as number,
            }))
          );
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return { nodes, loading };
}
