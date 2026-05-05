// app/components/Nav.tsx
import Link from 'next/link';

export default function Nav({
  year,
  initials,
  fetchedAt,
}: {
  year: string;
  initials: string;
  fetchedAt: string;
}) {
  const updated = new Date(fetchedAt).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <nav className="bg-white border-b border-slate-200 px-8 h-[60px] flex items-center justify-between sticky top-0 z-[100] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-gradient-to-br from-[#1B3A8A] to-[#0EA5E9] rounded-lg flex items-center justify-center text-white text-sm font-black tracking-[-1px]">
          Q
        </div>
        <span className="text-base font-bold text-slate-900">
          Cuántico <span className="text-sky-500">·</span> SGC
        </span>
      </div>

      <div className="flex items-center gap-4">
        <span className="bg-slate-100 rounded-full px-3 py-1.5 text-xs text-slate-500 font-medium border border-slate-200">
          Actualizado {updated}
        </span>
        <div className="flex gap-1">
          {(['2026', '2025'] as const).map(y => (
            <Link
              key={y}
              href={`/?year=${y}`}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                year === y
                  ? 'bg-[#1B3A8A] text-white border-[#1B3A8A]'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
        <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[#1B3A8A] to-[#0EA5E9] flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
      </div>
    </nav>
  );
}
