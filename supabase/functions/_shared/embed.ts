export async function embed(texts: string[], type: 'document' | 'query') {
  const apiKey = Deno.env.get('VOYAGE_API_KEY');
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY not set in edge function secrets');
  }

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: texts,
      input_type: type,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  }

  const { data } = await res.json();
  
  // pad 1024 -> 1536 (harmless within a single model)
  return data.map((d: { embedding: number[] }) => [
    ...d.embedding,
    ...new Array(512).fill(0),
  ]);
}
