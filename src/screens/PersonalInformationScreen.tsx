import { useCallback, useEffect, useRef, useState } from 'react';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { useAuth } from '../lib/auth-context';
import {
  MAX_NAME_LENGTH, forgetAvatarUrl, removeAvatar, requestAvatarUploadUrl,
  setAvatarKey, updateFullName, updatePhoneNumber, uploadAvatar, validateFullName,
  normalizeIndianMobile, validateIndianMobile,
} from '../lib/profile-api';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { Avatar } from '../components/ui/Avatar';

/**
 * Personal Information — name and profile picture, for members and the admin
 * alike.
 *
 * The row on the Profile screen has always been there and has never gone
 * anywhere; this is what it opens. Nothing on this screen can reach another
 * person's profile: the name update is filtered to the signed-in id and
 * refused by RLS otherwise, and the avatar endpoints take no id at all — the
 * server derives the object key from the verified token.
 *
 * Read-only fields (email, role) are shown rather than hidden. Someone
 * checking which account they are signed into should not have to guess, and an
 * editable-looking field that cannot be edited is worse than a plain line of
 * text.
 */

const PREVIEWABLE = /^image\/(jpeg|png|webp|heic)$/i;
const MAX_AVATAR_MB = 5;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={css('display:flex;flex-direction:column;gap:7px')}>
      <div style={css('font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--text-faint)')}>
        {label.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

export function PersonalInformationScreen() {
  const { user, profile, refreshProfile } = useAuth();

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [phone, setPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  /** Shown instead of the stored picture while a new one is being sent. */
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Seeded from the profile once it arrives, but never re-seeded afterwards:
  // a refreshProfile() mid-edit would otherwise throw away what is being typed.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !profile) return;
    setName(profile.full_name ?? '');
    setPhone(profile.phone ?? '');
    seeded.current = true;
  }, [profile]);

  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  const dirty = !!profile && name.trim() !== (profile.full_name ?? '').trim();
  const nameProblem = dirty ? validateFullName(name) : null;
  const dirtyPhone = !!profile && phone.trim() !== (profile.phone ?? '').trim();
  const phoneProblem = dirtyPhone ? validateIndianMobile(phone) : null;

  const saveName = useCallback(async () => {
    if (!user || savingName || !dirty) return;
    setError(null);
    setNameSaved(false);
    setSavingName(true);
    const result = await updateFullName(user.id, name);
    setSavingName(false);
    if (!result.ok) { setError(result.message ?? 'Could not save your name.'); return; }
    await refreshProfile();
    setNameSaved(true);
    window.setTimeout(() => setNameSaved(false), 2400);
  }, [user, savingName, dirty, name, refreshProfile]);

  const savePhone = useCallback(async () => {
    if (!user || savingPhone || !dirtyPhone || phoneProblem) return;
    setError(null);
    setPhoneSaved(false);
    setSavingPhone(true);
    const result = await updatePhoneNumber(user.id, phone);
    setSavingPhone(false);
    if (!result.ok) { setError(result.message ?? 'Could not save your mobile number.'); return; }
    setPhone(normalizeIndianMobile(phone) ?? phone);
    await refreshProfile();
    setPhoneSaved(true);
    window.setTimeout(() => setPhoneSaved(false), 2400);
  }, [user, savingPhone, dirtyPhone, phoneProblem, phone, refreshProfile]);

  const pickPicture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked || !user) return;

    if (!PREVIEWABLE.test(picked.type)) {
      setError('Choose a JPEG, PNG, WebP or HEIC image.');
      return;
    }
    if (picked.size > MAX_AVATAR_MB * 1024 * 1024) {
      setError(`That image is larger than the ${MAX_AVATAR_MB} MB limit.`);
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);
    const preview = URL.createObjectURL(picked);
    setLocalPreview(preview);
    // Held so the old object's signed URL can be dropped from the cache once
    // the new one is in place.
    const previousKey = profile?.avatar_key ?? null;

    try {
      const ticket = await requestAvatarUploadUrl(picked);
      await uploadAvatar(ticket.uploadUrl, picked, picked.type, setProgress);
      // Only now does the row learn about the object: a key written before the
      // bytes land is a broken image everywhere this person is drawn.
      const ok = await setAvatarKey(user.id, ticket.storageKey);
      if (!ok) throw new Error('The picture uploaded but could not be saved to your profile.');
      forgetAvatarUrl(previousKey, user.id);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that picture.');
    } finally {
      setUploading(false);
      setProgress(null);
      setLocalPreview(null);
      URL.revokeObjectURL(preview);
    }
  }, [user, profile, refreshProfile]);

  const clearPicture = useCallback(async () => {
    if (removing || !profile?.avatar_key) return;
    setError(null);
    setRemoving(true);
    const previousKey = profile.avatar_key;
    const result = await removeAvatar();
    setRemoving(false);
    if (!result.ok) { setError(result.message ?? 'Could not remove the picture.'); return; }
    forgetAvatarUrl(previousKey, user?.id);
    await refreshProfile();
  }, [removing, profile, refreshProfile]);

  const busy = uploading || removing;

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:10px')}>
        <AppBackButton fallback="/profile" />
        <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>Personal Information</div>
      </div>

      <div className="nav-space" style={css('flex:1;min-height:0;overflow-y:auto;padding:0 20px 26px;display:flex;flex-direction:column;gap:22px;overscroll-behavior:contain')}>

        {/* ---- picture ---- */}
        <div style={css('padding-top:8px;display:flex;flex-direction:column;align-items:center;gap:14px')}>
          <div style={css('position:relative;flex:none')}>
            {localPreview ? (
              <img
                src={localPreview}
                alt="New profile picture"
                style={{ ...css('border-radius:50%;object-fit:cover;display:block'), width: 104, height: 104 }}
              />
            ) : (
              <Avatar name={profile?.full_name ?? ''} avatarKey={profile?.avatar_key} size={104} />
            )}
            {progress !== null && (
              <div style={css('position:absolute;inset:0;border-radius:50%;background:rgba(var(--shadow-rgb),.45);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--on-accent)')}>
                {Math.round(progress * 100)}%
              </div>
            )}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={pickPicture}
            style={{ display: 'none' }}
          />

          <div style={css('display:flex;gap:9px;flex-wrap:wrap;justify-content:center')}>
            <Hoverable
              onClick={() => !busy && fileInput.current?.click()}
              role="button"
              aria-disabled={busy}
              className="pressable"
              style={{
                ...css('height:38px;padding:0 16px;border-radius:10px;background:var(--accent);display:flex;align-items:center;font-size:13px;font-weight:700;color:var(--on-accent);cursor:pointer'),
                opacity: busy ? 0.55 : 1,
                pointerEvents: busy ? 'none' : 'auto',
              }}
              hoverStyle={css('background:var(--accent-hover)')}
            >
              {uploading ? 'Uploading…' : profile?.avatar_key ? 'Change picture' : 'Upload picture'}
            </Hoverable>

            {profile?.avatar_key && (
              <Hoverable
                onClick={clearPicture}
                role="button"
                aria-disabled={busy}
                className="pressable"
                style={{
                  ...css('height:38px;padding:0 16px;border-radius:10px;border:1px solid var(--danger-border);display:flex;align-items:center;font-size:13px;font-weight:700;color:var(--danger-ink);cursor:pointer'),
                  opacity: busy ? 0.55 : 1,
                  pointerEvents: busy ? 'none' : 'auto',
                }}
                hoverStyle={css('background:var(--danger-soft)')}
              >
                {removing ? 'Removing…' : 'Remove'}
              </Hoverable>
            )}
          </div>

          <div style={css('font-size:11.5px;color:var(--text-faint);text-align:center;line-height:1.5;text-wrap:pretty;max-width:280px')}>
            JPEG, PNG, WebP or HEIC, up to {MAX_AVATAR_MB} MB. Your picture is stored
            privately and shown to other members beside your name.
          </div>
        </div>

        <div style={css('height:1px;background:var(--surface-divider)')} />

        {/* ---- name ---- */}
        <Field label="Full name">
          <input
            value={name}
            onChange={e => { setName(e.target.value); setNameSaved(false); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveName(); } }}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Your name"
            aria-label="Full name"
            aria-invalid={!!nameProblem}
            style={{
              ...css('width:100%;min-width:0;height:48px;border-radius:12px;padding:0 14px;font-size:15px;background:var(--surface-secondary)'),
              border: `1px solid ${nameProblem ? 'var(--danger-border)' : 'var(--border-4)'}`,
            }}
          />
          <div style={css('display:flex;align-items:center;gap:10px;min-height:20px')}>
            <div style={css('flex:1;min-width:0;font-size:11.5px;line-height:1.45;text-wrap:pretty')}>
              {nameProblem ? (
                <span style={css('color:var(--danger-ink)')}>{nameProblem}</span>
              ) : nameSaved ? (
                <span style={css('color:var(--success-ink)')}>Saved.</span>
              ) : (
                <span style={css('color:var(--text-faint)')}>
                  Other members see this only when name sharing is on; admins always see it.
                </span>
              )}
            </div>
            <div style={css('flex:none;font-size:11px;color:var(--text-faint);font-variant-numeric:tabular-nums')}>
              {name.trim().length}/{MAX_NAME_LENGTH}
            </div>
          </div>

          <Hoverable
            onClick={saveName}
            role="button"
            aria-disabled={!dirty || !!nameProblem || savingName}
            className="pressable"
            style={{
              ...css('height:46px;border-radius:12px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--on-accent);cursor:pointer'),
              opacity: !dirty || nameProblem || savingName ? 0.45 : 1,
              pointerEvents: !dirty || nameProblem || savingName ? 'none' : 'auto',
            }}
            hoverStyle={css('background:var(--accent-hover)')}
          >
            {savingName ? 'Saving…' : 'Save name'}
          </Hoverable>
        </Field>

        <div style={css('height:1px;background:var(--surface-divider)')} />

        <Field label="Mobile number (optional)">
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={event => { setPhone(event.target.value); setPhoneSaved(false); }}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void savePhone(); } }}
            maxLength={20}
            placeholder="+91 98765 43210"
            aria-label="Mobile number"
            aria-invalid={!!phoneProblem}
            style={{
              ...css('width:100%;min-width:0;height:48px;border-radius:12px;padding:0 14px;font-size:15px;background:var(--surface-secondary)'),
              border: `1px solid ${phoneProblem ? 'var(--danger-border)' : 'var(--border-4)'}`,
            }}
          />
          <div style={css('min-height:18px;font-size:11.5px;line-height:1.45')}>
            {phoneProblem ? <span style={css('color:var(--danger-ink)')}>{phoneProblem}</span>
              : phoneSaved ? <span style={css('color:var(--success-ink)')}>Saved.</span>
                : <span style={css('color:var(--text-faint)')}>Optional. Visible only in your personal information.</span>}
          </div>
          <Hoverable
            onClick={savePhone}
            role="button"
            aria-disabled={!dirtyPhone || !!phoneProblem || savingPhone}
            className="pressable"
            style={{
              ...css('height:46px;border-radius:12px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--on-accent);cursor:pointer'),
              opacity: !dirtyPhone || phoneProblem || savingPhone ? 0.45 : 1,
              pointerEvents: !dirtyPhone || phoneProblem || savingPhone ? 'none' : 'auto',
            }}
            hoverStyle={css('background:var(--accent-hover)')}
          >
            {savingPhone ? 'Saving…' : 'Save mobile number'}
          </Hoverable>
        </Field>

        <div style={css('height:1px;background:var(--surface-divider)')} />

        {/* ---- read-only ---- */}
        <Field label="Email">
          <div style={css('font-size:14px;color:var(--text-secondary);word-break:break-all')}>
            {user?.email ?? '—'}
          </div>
          <div style={css('font-size:11.5px;color:var(--text-faint);line-height:1.45')}>
            Your sign-in address. Changing it isn&rsquo;t available here &mdash; message the admin team.
          </div>
        </Field>

        <Field label="Account">
          <div style={css('font-size:14px;color:var(--text-secondary)')}>
            {profile?.role === 'admin' ? 'Admin' : 'Member'}
            {profile?.role !== 'admin' && profile?.activated_at ? ' · activated' : ''}
          </div>
        </Field>

        {error && (
          <div role="alert" style={css('padding:13px;border-radius:12px;background:var(--danger-soft);font-size:12.5px;color:var(--danger-ink);line-height:1.5')}>
            {error}
          </div>
        )}
      </div>
    </PhoneShell>
  );
}
