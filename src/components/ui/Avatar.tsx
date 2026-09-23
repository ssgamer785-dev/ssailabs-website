import { useEffect, useState } from 'react';
import { css } from '../../lib/css';
import { getAvatarUrl } from '../../lib/profile-api';

/**
 * A person's profile picture, falling back to their initials.
 *
 * One component so that every place a person is drawn — the profile header,
 * the admin inbox, a post byline — resolves the signed URL the same way and
 * degrades the same way. The initials are not a loading state: they are what
 * is shown when someone has no picture, which is most people.
 *
 * Not lazy, unlike post media. An avatar is a few KB behind a cached signature
 * and is almost always already on screen when it mounts; an IntersectionObserver
 * per row would cost more than the request it defers.
 */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, avatarKey, size, bg, fg, fontSize }: {
  name: string;
  avatarKey: string | null | undefined;
  size: number;
  bg?: string;
  fg?: string;
  fontSize?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    if (!avatarKey) return;

    let active = true;
    getAvatarUrl(avatarKey)
      .then(resolved => { if (active) setUrl(resolved); })
      // A picture that will not load is not worth an error message next to
      // someone's name; the initials are a complete answer on their own.
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [avatarKey]);

  const showImage = !!url && !failed;

  return (
    <div
      style={{
        ...css('border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden'),
        width: size,
        height: size,
        background: bg ?? 'var(--avatar-bg)',
        color: fg ?? 'var(--avatar-ink)',
        fontSize: fontSize ?? Math.round(size * 0.36),
        fontWeight: 700,
      }}
    >
      {showImage ? (
        <img
          src={url}
          alt={name ? `${name}'s profile picture` : 'Profile picture'}
          decoding="async"
          onError={() => setFailed(true)}
          style={css('width:100%;height:100%;object-fit:cover;display:block')}
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </div>
  );
}
