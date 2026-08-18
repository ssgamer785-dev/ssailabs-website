import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppStateProvider } from './lib/app-state';
import { AuthProvider } from './lib/auth-context';
import { RequireAuth, RedirectIfAuthed } from './components/RequireAuth';
import { SplashScreen } from './screens/SplashScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SignupScreen } from './screens/SignupScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CommunityPage } from './screens/CommunityPage';
import { CreatePostScreen } from './screens/CreatePostScreen';
import { RiskCalculatorScreen } from './screens/RiskCalculatorScreen';
import { MarketNewsScreen } from './screens/MarketNewsScreen';
import { ChatListScreen } from './screens/ChatListScreen';
import { AdminChatScreen } from './screens/AdminChatScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AnalysisDetailScreen } from './screens/AnalysisDetailScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { AdminInboxScreen } from './screens/AdminInboxScreen';
import { NameVisibilityScreen } from './screens/NameVisibilityScreen';
import { CommunityAdminPreviewScreen, CommunityMemberPreviewScreen } from './screens/CommunityPreviewScreens';

export default function App() {
  return (
    <AuthProvider>
      <AppStateProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<SplashScreen />} />
            <Route path="/login" element={<RedirectIfAuthed><LoginScreen /></RedirectIfAuthed>} />
            <Route path="/signup" element={<RedirectIfAuthed><SignupScreen /></RedirectIfAuthed>} />
            <Route path="/home" element={<RequireAuth><HomeScreen /></RequireAuth>} />
            <Route path="/community" element={<RequireAuth><CommunityPage /></RequireAuth>} />
            <Route path="/community/admin-view" element={<RequireAuth><CommunityAdminPreviewScreen /></RequireAuth>} />
            <Route path="/community/member-view" element={<RequireAuth><CommunityMemberPreviewScreen /></RequireAuth>} />
            <Route path="/create-post" element={<RequireAuth><CreatePostScreen /></RequireAuth>} />
            <Route path="/calculator" element={<RequireAuth><RiskCalculatorScreen /></RequireAuth>} />
            <Route path="/news" element={<RequireAuth><MarketNewsScreen /></RequireAuth>} />
            <Route path="/chat" element={<RequireAuth><ChatListScreen /></RequireAuth>} />
            <Route path="/chat/admin" element={<RequireAuth><AdminChatScreen /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfileScreen /></RequireAuth>} />
            <Route path="/profile/name-visibility" element={<RequireAuth><NameVisibilityScreen /></RequireAuth>} />
            <Route path="/analysis" element={<RequireAuth><AnalysisDetailScreen /></RequireAuth>} />
            <Route path="/notifications" element={<RequireAuth><NotificationsScreen /></RequireAuth>} />
            <Route path="/admin-inbox" element={<RequireAuth><AdminInboxScreen /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppStateProvider>
    </AuthProvider>
  );
}
