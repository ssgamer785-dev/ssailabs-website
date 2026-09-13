import { useSearchParams } from 'react-router-dom';
import { useAppState } from '../lib/app-state';
import { CommunityScreen } from '../components/CommunityScreen';
import { PhoneShell } from '../components/PhoneShell';

export function CommunityPage() {
  const { reveal, toggleReveal, userName } = useAppState();
  const [params] = useSearchParams();
  // The Students feed already exists behind the tab control; reading it off the
  // URL lets a link that says "Students Community" actually land on it. No
  // param, and the screen opens on Official exactly as before.
  const initialTab = params.get('tab') === 'students' ? 'students' : 'official';

  return (
    <PhoneShell>
      <CommunityScreen initialTab={initialTab} reveal={reveal} onToggleReveal={toggleReveal} userName={userName} />
    </PhoneShell>
  );
}
