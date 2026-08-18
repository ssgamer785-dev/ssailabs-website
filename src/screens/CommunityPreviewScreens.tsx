import { useAppState } from '../lib/app-state';
import { CommunityScreen } from '../components/CommunityScreen';
import { PhoneShell } from '../components/PhoneShell';

export function CommunityAdminPreviewScreen() {
  const { reveal, userName } = useAppState();
  return (
    <PhoneShell>
      <CommunityScreen initialTab="students" adminView reveal={reveal} userName={userName} />
    </PhoneShell>
  );
}

export function CommunityMemberPreviewScreen() {
  const { reveal, userName } = useAppState();
  return (
    <PhoneShell>
      <CommunityScreen initialTab="students" asOthers reveal={reveal} userName={userName} />
    </PhoneShell>
  );
}
