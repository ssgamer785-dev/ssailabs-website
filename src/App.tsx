import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppStateProvider } from './lib/app-state';
import { SplashScreen } from './screens/SplashScreen';
import { LoginScreen } from './screens/LoginScreen';
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
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SplashScreen />} />
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/community/admin-view" element={<CommunityAdminPreviewScreen />} />
          <Route path="/community/member-view" element={<CommunityMemberPreviewScreen />} />
          <Route path="/create-post" element={<CreatePostScreen />} />
          <Route path="/calculator" element={<RiskCalculatorScreen />} />
          <Route path="/news" element={<MarketNewsScreen />} />
          <Route path="/chat" element={<ChatListScreen />} />
          <Route path="/chat/admin" element={<AdminChatScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/profile/name-visibility" element={<NameVisibilityScreen />} />
          <Route path="/analysis" element={<AnalysisDetailScreen />} />
          <Route path="/notifications" element={<NotificationsScreen />} />
          <Route path="/admin-inbox" element={<AdminInboxScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}
