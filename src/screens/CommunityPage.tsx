import { useAppState } from '../lib/app-state';
import { CommunityScreen } from '../components/CommunityScreen';
import { PhoneShell } from '../components/PhoneShell';

export function CommunityPage() {
  const { reveal, toggleReveal, userName } = useAppState();
  return (
    <PhoneShell>
      <CommunityScreen initialTab="official" reveal={reveal} onToggleReveal={toggleReveal} userName={userName} />
    </PhoneShell>
  );
}
