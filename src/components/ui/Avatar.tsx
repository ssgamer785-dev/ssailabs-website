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

export function Avatar({ name, avatarKey, avatarUserId, size, bg, fg, fontSize }: {
  name: string;
  avatarKey: string | null | undefined;
  /** Resolves the signed avatar URL server-side without exposing profile fields. */
  avatarUserId?: string | null;
  size: number;
  bg?: string;
  fg?: string;
  fontSize?: number;
}) {
  const identity = avatarKey ? `key:${avatarKey}` : avatarUserId ? `user:${avatarUserId}` : '';
  const [resolved, setResolved] = useState<{ identity: string; url: string } | null>(null);
  const [failedIdentity, setFailedIdentity] = useState('');

  useEffect(() => {
    if (!identity) return;
    setFailedIdentity('');

    let active = true;
    getAvatarUrl(avatarKey, avatarUserId)
      .then(url => { if (active) setResolved({ identity, url }); })
      // A picture that will not load is not worth an error message next to
      // someone's name; the initials are a complete answer on their own.
      .catch(() => { if (active) setFailedIdentity(identity); });
    return () => { active = false; };
  }, [identity, avatarKey, avatarUserId]);

  const showImage = !!identity && resolved?.identity === identity && failedIdentity !== identity;

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
          src={resolved.url}
          alt={name ? `${name}'s profile picture` : 'Profile picture'}
          decoding="async"
          onError={() => setFailedIdentity(identity)}
          style={css('width:100%;height:100%;object-fit:cover;display:block')}
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </div>
  );
}
