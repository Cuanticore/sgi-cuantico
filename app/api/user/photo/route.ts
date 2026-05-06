import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const token = await getToken({ req });

  if (!token?.accessToken) {
    return new Response(null, { status: 401 });
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
    headers: { Authorization: `Bearer ${token.accessToken as string}` },
  });

  if (!res.ok) {
    return new Response(null, { status: 404 });
  }

  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';

  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
