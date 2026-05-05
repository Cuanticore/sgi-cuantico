'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import UserMenu from './UserMenu';

export default function Nav({
  year,
  initials,
  fetchedAt,
  matrixUrl,
}: {
  year: string;
  initials: string;
  fetchedAt: string;
  matrixUrl: string;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <nav className="bg-gradient-to-r from-slate-900 via-[#1B3A8A] to-[#0c2461] px-4 md:px-8 h-[60px] flex items-center justify-between sticky top-0 z-[100] shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo.jpeg"
            alt="Cuantico"
            width={44}
            height={44}
            className="object-contain"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-white text-sm font-black tracking-[1px] uppercase">
              Cuantico
            </span>
            <span className="text-sky-300 text-[10px] font-semibold tracking-[2px] uppercase">
              SGC
            </span>
          </div>
        </div>

        {/* Desktop controls — hidden on mobile */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href={matrixUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-sky-400 hover:bg-sky-300 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-[0_0_12px_rgba(56,189,248,0.4)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 opacity-80">
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
            </svg>
            Matriz de Indicadores
          </a>
          <div className="flex gap-1">
            {(['2026', '2025'] as const).map(y => (
              <Link
                key={y}
                href={`/?year=${y}`}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  year === y
                    ? 'bg-white text-[#1B3A8A] border-white'
                    : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
          <UserMenu initials={initials} />
        </div>

        {/* Hamburger button — visible on mobile only */}
        <button
          className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-[5px] rounded-lg hover:bg-white/10 transition-colors"
          onClick={() => setIsMenuOpen(prev => !prev)}
          aria-label="Menú"
        >
          <span className={`block w-5 h-[2px] bg-white transition-transform origin-center ${isMenuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
          <span className={`block w-5 h-[2px] bg-white transition-opacity ${isMenuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-[2px] bg-white transition-transform origin-center ${isMenuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
        </button>
      </nav>

      {/* Click-outside backdrop */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-[98] md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Mobile dropdown menu */}
      <div
        className={`${isMenuOpen ? 'flex' : 'hidden'} md:hidden flex-col bg-gradient-to-b from-slate-900 to-[#0c2461] border-t border-white/10 px-4 py-4 gap-4 sticky top-[60px] z-[99] shadow-[0_4px_12px_rgba(0,0,0,0.3)]`}
      >
        <a
          href={matrixUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setIsMenuOpen(false)}
          className="flex items-center gap-2 bg-sky-400 hover:bg-sky-300 text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-[0_0_12px_rgba(56,189,248,0.4)] transition-colors w-fit"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 opacity-80">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clipRule="evenodd" />
          </svg>
          Matriz de Indicadores
        </a>

        <div className="flex gap-2">
          <span className="text-white/50 text-sm self-center">Año:</span>
          {(['2026', '2025'] as const).map(y => (
            <Link
              key={y}
              href={`/?year=${y}`}
              onClick={() => setIsMenuOpen(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                year === y
                  ? 'bg-white text-[#1B3A8A] border-white'
                  : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/20'
              }`}
            >
              {y}
            </Link>
          ))}
        </div>

        <div className="border-t border-white/10 pt-3">
          <UserMenu initials={initials} />
        </div>
      </div>
    </>
  );
}
