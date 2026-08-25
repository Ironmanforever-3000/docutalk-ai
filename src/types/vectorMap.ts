export interface ChunkNode {
  chunk_id: string;
  text_content: string;
  x_coordinate: number;
  y_coordinate: number;
  chunk_index: number;
}

export interface RetrievalHighlight {
  chunk_id: string;
  similarity_score: number;
  rank: number;
}
