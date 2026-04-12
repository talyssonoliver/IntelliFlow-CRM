import { NextResponse } from 'next/server';

interface WebhookTestRequest {
  url: string;
  payload: unknown;
  headers?: Record<string, string>;
}

export async function POST(request: Request) {
  let body: WebhookTestRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: 0, latencyMs: 0, body: 'Invalid request body', responseHeaders: {} },
      { status: 400 }
    );
  }

  if (!body.url) {
    return NextResponse.json(
      { status: 0, latencyMs: 0, body: 'URL is required', responseHeaders: {} },
      { status: 400 }
    );
  }

  const start = Date.now();

  try {
    const response = await fetch(body.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...body.headers,
      },
      body: JSON.stringify(body.payload),
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - start;
    const responseBody = await response.text();
    const responseHeaders = Object.fromEntries(response.headers);

    return NextResponse.json({
      status: response.status,
      latencyMs,
      body: responseBody,
      responseHeaders,
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';

    return NextResponse.json(
      { status: 0, latencyMs, body: message, responseHeaders: {} },
      { status: 502 }
    );
  }
}
