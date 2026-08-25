type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  let body: { provider?: string; apiKey?: string };
  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    body = JSON.parse(rawBody);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Request body must be valid JSON' }));
  }

  const { provider, apiKey } = body;
  if (!provider || !apiKey) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'provider and apiKey are required' }));
  }

  try {
    let endpoint = '';
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let payload: unknown;

    switch (provider) {
      case 'anthropic':
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        };
        payload = {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          system: 'Reply with just the word "ok".',
          messages: [{ role: 'user', content: 'ping' }],
        };
        break;
      case 'groq':
        endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        headers = {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        };
        payload = {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'Reply with just the word "ok".' },
            { role: 'user', content: 'ping' },
          ],
          max_tokens: 10,
        };
        break;
      case 'openai':
        endpoint = 'https://api.openai.com/v1/chat/completions';
        headers = {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        };
        payload = {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'Reply with just the word "ok".' },
            { role: 'user', content: 'ping' },
          ],
          max_tokens: 10,
        };
        break;
      default:
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: `Unsupported provider: ${provider}` }));
    }

    const providerRes = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!providerRes.ok) {
      const text = await providerRes.text().catch(() => 'No response body');
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: `Provider responded with ${providerRes.status}: ${text}` }));
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Provider test failed' }));
  }
}
