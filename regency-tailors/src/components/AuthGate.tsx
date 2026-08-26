import React from 'react';
import { LogIn, ShieldAlert, Loader2, Settings2, LogOut } from 'lucide-react';
import { RegencyLogo } from './RegencyLogo';
import { useAuth } from '../lib/auth';

/**
 * Nothing renders behind this gate until an authorised Admin is signed in.
 *
 * The gate is a convenience, not the security boundary — Row Level Security
 * in Postgres is what actually protects the data. Both must hold: a tampered
 * client that skipped this screen would still receive nothing from the
 * database.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user, error, signInWithGoogle, signOut } = useAuth();

  if (status === 'authorized') return <>{children}</>;

  return (
    <div className="min-h-screen w-full bg-[#F7F3EA] bg-chevron-pattern text-[#071426] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border-2 border-[#C9A24A]/40 shadow-xl overflow-hidden">
        <div className="bg-[#071426] px-6 py-6 flex flex-col items-center gap-1">
          <RegencyLogo size="sm" />
          <div className="text-[10px] font-bold tracking-[0.25em] text-[#C9A24A] uppercase mt-1">
            Showroom &amp; Tailoring Suite
          </div>
        </div>

        <div className="p-7 space-y-5">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#C9A24A]" />
              <p className="text-sm font-semibold text-[#4A5568]">Checking your showroom access…</p>
            </div>
          )}

          {status === 'unconfigured' && (
            <div className="space-y-3 text-center">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                <Settings2 className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-extrabold">Database not configured</h1>
              <p className="text-sm text-[#4A5568] leading-relaxed">
                This build has no Supabase credentials, so there is nothing to sign in to. Set{' '}
                <code className="text-xs bg-[#FAF8F5] border border-[#E0D8CB] rounded px-1 py-0.5">VITE_SUPABASE_URL</code>{' '}
                and{' '}
                <code className="text-xs bg-[#FAF8F5] border border-[#E0D8CB] rounded px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code>{' '}
                and reload. See <strong>SUPABASE_SETUP.md</strong>.
              </p>
            </div>
          )}

          {status === 'signed-out' && (
            <div className="space-y-5 text-center">
              <div>
                <h1 className="text-xl font-extrabold">Showroom sign in</h1>
                <p className="text-sm text-[#4A5568] mt-1.5 leading-relaxed">
                  Customer records, orders and measurements are available only to the authorised
                  showroom account.
                </p>
              </div>

              <button
                onClick={signInWithGoogle}
                className="w-full px-5 py-3 bg-[#071426] hover:bg-[#0B1930] text-[#D4AF5A] font-extrabold text-sm rounded-2xl uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer transition-colors"
              >
                <LogIn className="w-4 h-4 text-[#C9A24A]" />
                <span>Continue with Google</span>
              </button>

              {error && (
                <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                  {error}
                </p>
              )}
            </div>
          )}

          {status === 'unauthorized' && (
            <div className="space-y-4 text-center">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-extrabold">This account is not authorised</h1>
              <p className="text-sm text-[#4A5568] leading-relaxed">
                {user?.email ? (
                  <>
                    <strong className="text-[#071426]">{user.email}</strong> signed in successfully but
                    is not on the showroom's authorised list, so no business data is available to it.
                  </>
                ) : (
                  'This account is not on the showroom’s authorised list.'
                )}
              </p>
              <p className="text-xs text-[#7A7060] leading-relaxed">
                The showroom owner can authorise it by running{' '}
                <code className="bg-[#FAF8F5] border border-[#E0D8CB] rounded px-1 py-0.5">
                  select public.authorize_admin('{user?.email || 'address@gmail.com'}');
                </code>{' '}
                in the Supabase SQL editor.
              </p>

              {error && (
                <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                  {error}
                </p>
              )}

              <button
                onClick={signOut}
                className="w-full px-5 py-2.5 bg-[#FAF8F5] hover:bg-[#EFE9DD] border border-[#D5CCA8] text-[#071426] font-bold text-xs rounded-2xl uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out and try another account</span>
              </button>
            </div>
          )}
        </div>

        <div className="px-7 py-3 bg-[#FAF8F5] border-t border-[#E6E1D7] text-center">
          <span className="text-[10px] font-bold text-[#8C7E6A] uppercase tracking-wider">
            Regency Tailors • Jalandhar
          </span>
        </div>
      </div>
    </div>
  );
};
