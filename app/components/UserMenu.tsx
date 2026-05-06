'use client';

import { signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';

export default function UserMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-[34px] h-[34px] rounded-full overflow-hidden border-2 border-white/20 hover:opacity-80 transition-opacity flex items-center justify-center bg-gradient-to-br from-sky-400 to-[#1B3A8A]"
      >
        {!photoFailed ? (
          <img
            src="/api/user/photo"
            alt={initials}
            className="w-full h-full object-cover"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <span className="text-white text-xs font-bold">{initials}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            onClick={() => signOut({ callbackUrl: '/auth/signin' })}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-400">
              <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-1.048a.75.75 0 1 0-1.06-1.06l-2.5 2.5a.75.75 0 0 0 0 1.06l2.5 2.5a.75.75 0 1 0 1.06-1.06L8.704 10.75H18.25A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
