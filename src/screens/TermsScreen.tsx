import { B, DocumentScreen, P, Points, Section } from '../components/ui/DocumentScreen';

/** Text transcribed from the four supplied screenshots in serial order. */
export function TermsScreen() {
  return (
    <DocumentScreen title="Terms & Conditions">
      <Section title="ENROLLMENT FORM">
        <P>THE TRADER'S PLANET.</P>
        <P>Name :<br />Age :<br />Father's Name :<br />Address :<br />Email :<br />Contact No :</P>
        <P>By enrolling in THE TRADERS PLANET, the student ____________________ agrees to the following Terms and Conditions:</P>
      </Section>

      <Section title="1. Course Enrollment & Access"><Points items={[
        <>Enrollment in any course, program, or mentorship offered by the traders planet grants the Participant lifetime access to the course content, subject to platform availability.</>,
        <>“Lifetime access” refers to access for as long as the academy and its learning platform remain operational.</>,
      ]} /></Section>

      <Section title="2. Fees & Payment Policy"><Points items={[
        <>All course fees paid to The Traders Planet are strictly non-refundable and non-transferable under any circumstances.</>,
        <>Once the payment is made, no refunds, chargebacks, or cancellations will be entertained since it's a lifetime access.</>,
      ]} /></Section>

      <Section title="3. No Guarantee of Profits"><Points items={[
        <>Trading in financial markets involves significant risk.</>,
        <>The Traders Planet does not guarantee any profits, returns, or success.</>,
        <>Past performance, strategies, or examples shared during training are for educational purposes only and do not ensure future results.</>,
      ]} /></Section>

      <Section title="4. Educational Purpose Only"><Points items={[
        <>All content, strategies, live sessions, and materials are provided solely for educational and informational purposes.</>,
        <>Nothing shared by The Traders Planet should be considered financial, investment, or legal advice.</>,
      ]} /></Section>

      <Section title="5. Intellectual Property"><Points items={[
        <>All course materials, PDFs, recordings, strategies, and content are the intellectual property of The Traders Planet.</>,
        <>Reproduction, resale, redistribution, sharing, or recording of any content without written permission is strictly prohibited and may lead to legal action.</>,
      ]} /></Section>

      <Section title="6. Code of Conduct"><Points items={[
        <>Participants must maintain respectful behavior during live sessions, groups, or interactions.</>,
        <>Any misconduct, abuse, or violation of academy rules may result in immediate termination of access without any refund.</>,
      ]} /></Section>

      <Section title="7. Course Modifications">
        <P>The Traders Planet reserves the right to:</P>
        <Points items={[<>Modify course content</>, <>Update strategies</>, <>Change session schedules</>, <>Upgrade or replace learning materials without prior notice.</>]} />
      </Section>

      <Section title="8. Limitation of Liability"><Points items={[
        <>The Traders Planet shall not be held responsible for any financial loss, trading loss, emotional distress, or damages incurred while applying learned concepts.</>,
        <>The Participant agrees to take full responsibility for their trading decisions.</>,
      ]} /></Section>

      <Section title="9. Termination of Access"><Points items={[
        <>Access may be suspended or terminated if the Participant violates these Terms & Conditions.</>,
        <>In such cases, no refund or compensation will be provided.</>,
      ]} /></Section>

      <Section title="10. Acceptance of Terms">
        <P>By enrolling and making payment, the Participant acknowledges that they have:</P>
        <Points items={[<>Read</>, <>Understood</>, <>Agreed to these Terms & Conditions in full.</>]} />
      </Section>

      <Section title="11. Governing Law and Jurisdiction"><P>
        These Terms & Conditions shall be governed by and construed in accordance with the laws of India. Any disputes arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts of <B>your city</B>.
      </P></Section>
    </DocumentScreen>
  );
}
