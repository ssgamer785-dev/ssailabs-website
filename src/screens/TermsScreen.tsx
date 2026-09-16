import { SUPPORT_EMAIL } from '../lib/support';
import { B, Callout, DocumentScreen, P, Points, Section } from '../components/ui/DocumentScreen';

/**
 * The risk warning sits first, above the housekeeping, because it is the part
 * that matters on a trading-education platform and the part a reader is most
 * likely to skim past if it is buried at clause nine.
 */
export function TermsScreen() {
  return (
    <DocumentScreen
      title="Terms & Conditions"
      intro="The agreement between you and The Traders Planet when you use this app."
      updated="14 September 2026"
    >
      <Callout tone="warning" title="Trading carries risk">
        Everything here is education, not financial advice. Nothing in this app — no post, analysis,
        signal, level or message — is a recommendation to buy or sell anything. Markets can move
        against you and you can lose money, including more than you put in with leveraged products.
        Every decision you take is yours, and so is the outcome.
      </Callout>

      <Section title="What The Traders Planet is">
        <P>
          A learning community for traders: lessons and analysis from the team, a space for members
          to share ideas, a risk calculator and a direct line to the admins. It is not a broker, a
          fund, a signal service you are expected to follow, or a portfolio manager.
        </P>
      </Section>

      <Section title="Using the app means agreeing to this">
        <P>
          By creating an account or continuing to use The Traders Planet, you accept these terms. If
          you do not, please stop using the app and write to us to have your account closed.
        </P>
      </Section>

      <Section title="Your account">
        <Points
          items={[
            <>One account per person. Keep your password to yourself and do not let anyone else use your login.</>,
            <>Give accurate details when you sign up, and keep them current.</>,
            <>You are responsible for what happens under your account.</>,
            <>Tell us at <B>{SUPPORT_EMAIL}</B> if you think someone else has got into it.</>,
          ]}
        />
      </Section>

      <Section title="How to behave here">
        <P>Posting in the community is a privilege the group extends to you. Do not:</P>
        <Points
          items={[
            <>abuse, harass or threaten anyone, or post hateful material;</>,
            <>spam, advertise, or promote other services and referral links;</>,
            <>post anything unlawful, or anything you do not have the right to share;</>,
            <>impersonate another member, an admin, or the platform itself;</>,
            <>reveal another member's identity or private information — including anyone posting as Unknown User;</>,
            <>solicit money from members or present yourself as managing their funds.</>,
          ]}
        />
        <P>
          Admins can remove any post or message and can suspend or close an account that breaks
          these rules, without notice where the breach is serious.
        </P>
      </Section>

      <Section title="What you post stays yours">
        <P>
          You keep ownership of everything you write and upload. By posting it here you give us
          permission to store it and show it to other members of the platform, for as long as it is
          posted. Nothing more — we do not republish your content elsewhere.
        </P>
        <P>
          You are responsible for what you post, including making sure you have the right to share
          any chart, document or recording you upload.
        </P>
      </Section>

      <Section title="Media and storage">
        <P>
          Each account has a storage allowance for the images, video, PDFs and voice notes it
          uploads. When you reach it, the oldest media in your conversation is removed automatically
          so that new messages can send. Treat the app as a place to share files, not as the only
          place you keep them.
        </P>
      </Section>

      <Section title="Availability">
        <P>
          We work to keep the app up, but we do not promise uninterrupted service. Features can
          change, and screens marked as coming soon may arrive later than expected or not at all.
          Market data is not connected — anything the app shows is either posted by a member or
          written by the team.
        </P>
      </Section>

      <Section title="Ending it">
        <P>
          You can stop using the app whenever you like and ask us to close your account. We can
          suspend or close an account that breaks these terms. Closing an account removes your
          access; content already shared with the community may be removed at the same time.
        </P>
      </Section>

      <Section title="Changes and contact">
        <P>
          If these terms change materially, the updated date above will change and we will say so in
          the app. Continuing to use The Traders Planet after that means accepting the new version.
          Questions go to <B>{SUPPORT_EMAIL}</B>.
        </P>
      </Section>

      <Callout title="A note on this document">
        These terms are written to be clear and to reflect how the app actually works. They have not
        been reviewed by a lawyer: before launch the operator should have them checked and should
        add the governing law, the company details and the minimum age for an account.
      </Callout>
    </DocumentScreen>
  );
}
