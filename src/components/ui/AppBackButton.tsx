import { useNavigate } from 'react-router-dom';
import { css } from '../../lib/css';

/**
 * The one back control in the app.
 *
 * Six screens each drew their own — a bare 22px chevron here, a 21px one
 * there, a 34px shadowed circle on Analysis — and none of them were focusable
 * or had an accessible name. This is a real <button>: one icon, one size, one
 * 40px hit area, keyboard focus, and the press feedback every other control
 * uses.
 *
 * `fallback` is where to go when there is no history to pop — a deep link
 * opened straight into a detail screen must not leave the user stranded.
 */
export function AppBackButton({ fallback = '/home', label = 'Back' }: {
  fallback?: string;
  label?: string;
}) {
  const navigate = useNavigate();

  const goBack = () => {
    // A fresh tab has only this entry; popping it would leave the app.
    if (window.history.length > 1) navigate(-1);
    else navigate(fallback, { replace: true });
  };

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className="pressable icon-button"
      style={css('width:40px;height:40px;margin-left:-8px;flex:none;display:flex;align-items:center;justify-content:center;border:0;background:transparent;padding:0;cursor:pointer;color:#0F172A;border-radius:50%')}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('display:block')}>
        <path d="M14.5 5.5l-7 6.5 7 6.5" />
      </svg>
    </button>
  );
}
