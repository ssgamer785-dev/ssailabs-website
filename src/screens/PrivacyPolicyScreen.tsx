import { SUPPORT_EMAIL } from '../lib/support';
import { B, Callout, DocumentScreen, P, Points, Section } from '../components/ui/DocumentScreen';

/**
 * Written against what this app actually does rather than from a template: the
 * sections below describe the real account fields, the real name-visibility
 * rule, the real media storage and the real absence of a market-data feed. A
 * policy that claims more than the app does would be worse than none.
 */
export function PrivacyPolicyScreen() {
  return (
    <DocumentScreen
      title="Privacy Policy"
      intro="How The Traders Planet handles the information you give it, in plain language."
      updated="14 September 2026"
    >
      <Section title="What this covers">
        <P>
          This policy applies to The Traders Planet app and the account you use to sign in to it.
          It describes what the app stores, who can see it, and what you can do about it.
        </P>
      </Section>

      <Section title="Information you give us">
        <Points
          items={[
            <><B>Your account.</B> The email address and name you sign up with, and a phone number if you choose to add one.</>,
            <><B>What you post.</B> Posts, comments, likes and the trade levels you attach to them.</>,
            <><B>Messages.</B> Conversations you have with the admin team through the app.</>,
            <><B>Media.</B> Images, video, PDFs and voice notes you upload to a post or a message.</>,
          ]}
        />
      </Section>

      <Section title="Who can see your name">
        <P>
          Student posts appear under <B>Unknown User</B> unless you choose to share your name. That
          choice is yours and you can change it at any time under Profile → Name Visibility.
        </P>
        <P>
          One thing to be clear about: <B>the admin team always sees your real name</B>, on posts
          and in messages, whatever that setting says. It hides your name from other members, not
          from the people running the platform.
        </P>
      </Section>

      <Section title="Media you upload">
        <P>
          Media is kept in private storage. It is never publicly listed or linked — the app hands
          your device a short-lived link each time a file needs to be shown, and that link expires.
        </P>
        <P>
          Each account has a storage allowance. When you reach it, the oldest media in your
          conversation is removed to make room for what you are sending. The message stays; the file
          it carried is gone and cannot be recovered.
        </P>
      </Section>

      <Section title="What we do not do">
        <Points
          items={[
            <>We do not sell your information, and we do not share it with advertisers.</>,
            <>We do not connect to your broker, and the app cannot place trades on your behalf.</>,
            <>We do not track you across other apps or websites.</>,
          ]}
        />
      </Section>

      <Section title="Keeping and deleting your information">
        <P>
          You can delete your own posts and messages from inside the app. Deleting a post removes it
          and its media for everyone.
        </P>
        <P>
          If you want your whole account and its content removed, write to{' '}
          <B>{SUPPORT_EMAIL}</B> from the address you signed up with and we will action it.
        </P>
      </Section>

      <Section title="How it is protected">
        <P>
          Traffic between your device and our services is encrypted. Access to stored data is
          governed by per-account rules on the database itself, so one member's account cannot read
          another's records even if a request asks for them.
        </P>
      </Section>

      <Section title="Changes and contact">
        <P>
          If this policy changes in a way that affects you, the updated date above will change and
          we will say so in the app. Questions about any of it go to <B>{SUPPORT_EMAIL}</B>.
        </P>
      </Section>

      <Callout title="A note on this document">
        This is an accurate plain-language description of how the app handles your information. It
        is not a substitute for legal review: the operator should have it checked, and should
        confirm the governing jurisdiction, the minimum age for an account and any retention periods
        required where you live before relying on it.
      </Callout>
    </DocumentScreen>
  );
}
