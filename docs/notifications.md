# Notifications and push

How a member finds out that something happened: the in-app inbox, the number
on the app icon, and Web Push to a phone or computer that is not looking at the
app. Nothing here holds a secret; the keys and the webhook secret live in the
hosting environment and are named, not shown.

## What notifies whom

Only events that exist in the app. Nobody is ever notified about their own
action.

| Event | Who is told | Category (setting) | Default | Opens |
| --- | --- | --- | --- | --- |
| A message, photo, voice message, video message, PDF or file in a chat | The other side: the student for an admin's message, every admin for a student's | Direct messages | on | That message in the conversation |
| An official post (text, image, video, voice, PDF, file) | Activated students (not the admin who wrote it) | Official announcements | on | The post |
| A comment on my post | The post's author | Comments on my posts | on | The post, at the comment |
| A new post in the Students Community | The admin and every activated student, except the author | Students Community posts | on (a saved OFF is kept) | The post |
| A like on my post | The post's author, once per person per post | Likes | **off** | The post |
| An admin removes my post or comment | Its author | System and account | on | The community |
| A new membership request | Every admin | System and account | on | Membership requests |
| A member activates their account | Every admin | System and account | on | Activation codes |

Not built, because the app has no such feature: replies to comments (comments
are flat), mentions, and student-to-student messages.

## Where it lives

- **Database** (`supabase/migrations/20260929090000_…`, rolled back by
  `supabase/rollbacks/…`): `notification_preferences` (one row per member, own
  row only; no row means the defaults above), `category`, `link` and
  `actor_id` on `notifications`, `environment` and `platform` on
  `push_subscriptions`, one trigger function per event, and unique indexes so
  one event cannot notify one person twice. A notification row can only be
  written by these triggers, never by a client. Every trigger is non-blocking:
  if making a notification fails, the message, post or comment is still saved.
- **Server** (`server/push.ts`, `server/push-payload.ts`): the Supabase
  Database Webhook (INSERT on `notifications`) calls `POST /api/push/dispatch`
  with `x-push-webhook-secret`. For each of the recipient's devices it claims
  the pair (notification, device) in `push_deliveries`, so a replay sends
  nothing twice, then sends with VAPID.
- **Service worker** (`public/sw.js`): shows the banner, groups by tag, sets
  the app badge, routes a tap to the right screen, and re-subscribes if the
  browser replaces the subscription.
- **App** (`src/lib/notifications/`, `src/screens/NotificationsScreen.tsx`):
  the Notifications screen (device state and Enable button, preferences,
  inbox), one shared unread count for the sidebar and the icon badge, and
  deep links that survive signing in.

## Delivery rules

- The banner text is the notification's one-line **title** ("Rahul sent you a
  voice message"), never the message, comment or post text. Those stay in the
  inbox, which only the recipient can open.
- Rapid events about one thing share a tag, so a new banner replaces the old
  one and says how many are waiting; a `Topic` header lets the push service
  drop superseded ones.
- Urgency and lifetime: direct messages `high`, kept 24 hours; likes `low`,
  kept 1 hour; everything else, Students Community posts included, `normal`,
  kept 24 hours (the same as Official posts). A push service may hold a `low`
  message until the phone is charging or on Wi-Fi and drops it when its
  lifetime runs out, so `low` is used only for likes (off by default). The
  test push is `high`, kept 5 minutes, so a working test does not prove that
  `normal` or `low` pushes arrive.
- 404/410 from the push service removes that device. 429, 5xx and network
  errors are retried (bounded); a definite failure releases the claim so a
  later replay can try again. Configuration errors (401/403/400) are logged
  by status and reason, never with keys or endpoints.
- A device is only sent to by the deployment that registered it (Production
  or a Vercel Preview). A Preview shares the database with Production, so
  without this a phone registered through one would receive the other's
  pushes. Devices registered before the marker existed count as Production.
- On iPhone the worker always shows a banner for a push (WebKit removes a
  site's subscription after a few pushes that show nothing), then removes it
  again if the app is on screen.

## Sounds: four different things

1. **Delivery** — the push reached the device. Not controlled by the app.
2. **Display** — the operating system shows the banner. Permission and Focus
   modes belong to the user.
3. **Sound of a banner** — chosen by the operating system. A web app cannot
   set it, and on iPhone it cannot promise one.
4. **In-app sounds** (the refresh sound and the chime while the app is open) —
   the app's own, switched in Haptics, with a Sound check there.

## Configuration

Server environment (names only): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. `VERCEL_ENV` is set by Vercel and decides the
deployment's environment. Supabase: a Database Webhook on INSERT into
`public.notifications`, HTTP POST to `/api/push/dispatch` with the header
`x-push-webhook-secret`. Changing the VAPID keys invalidates every existing
subscription; do not.

## Testing

```
bun test server/push-dispatch.test.ts src/lib/notifications
supabase/tests/run.sh          # includes 70-notification-events.sql
```

Web Push itself needs real devices: a browser cannot prove that Apple's or
Google's push service delivered, or what a lock screen shows, so delivery, lock
screens, badges and sounds are checked by hand on a phone after a release.
