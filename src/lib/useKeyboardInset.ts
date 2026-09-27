import { useEffect, useState } from 'react';

/**
 * How many pixels of the layout viewport the on-screen keyboard is covering.
 *
 * iOS does not resize the layout viewport when the keyboard opens — it slides
 * the visual viewport up over the page instead, which is what buries a chat
 * composer under the keys. visualViewport is the only thing that reports it,
 * so the composer pads itself by this much and stays where the thumb expects.
 *
 * Returns 0 everywhere the API is missing, which is the correct answer on
 * desktop and on Android, where the viewport really does resize.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      // Sub-pixel noise and the address bar's own movement both land here;
      // anything under a finger's width is not a keyboard.
      setInset(covered > 40 ? Math.round(covered) : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
