// app/api/indicators/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { getIndicatorsData } from '@/app/lib/data';
import type { IndicatorYear } from '@/app/lib/sharepoint';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get('year');
  const year: IndicatorYear = yearParam === '2025' ? '2025' : '2026';

  try {
    const data = await getIndicatorsData(year);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err) {
    console.error('[/api/indicators]', err);
    return NextResponse.json(
      { error: 'Error loading indicators from SharePoint' },
      { status: 500 }
    );
  }
}
