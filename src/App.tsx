import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppStateProvider } from './lib/app-state';
import { AuthProvider } from './lib/auth-context';
import { ThemeProvider } from './lib/theme';
import { RequireAuth, RequireActivated, RequireAdmin, RedirectIfAuthed } from './components/RequireAuth';
import { SplashScreen } from './screens/SplashScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ActivationScreen } from './screens/ActivationScreen';
import { MembershipRequestScreen } from './screens/MembershipRequestScreen';
import { AdminLoginScreen } from './screens/AdminLoginScreen';
import { AdminActivationCodesScreen } from './screens/AdminActivationCodesScreen';
import { AdminMembershipRequestsScreen } from './screens/AdminMembershipRequestsScreen';
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
import { PostDetailScreen } from './screens/PostDetailScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { AdminInboxScreen } from './screens/AdminInboxScreen';
import { NameVisibilityScreen } from './screens/NameVisibilityScreen';
import { PersonalInformationScreen } from './screens/PersonalInformationScreen';
import { PrivacyPolicyScreen } from './screens/PrivacyPolicyScreen';
import { TermsScreen } from './screens/TermsScreen';
import { HelpSupportScreen } from './screens/HelpSupportScreen';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <AppStateProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<SplashScreen />} />
            {/* The entry point for anyone signed out. */}
            <Route path="/welcome" element={<RedirectIfAuthed><WelcomeScreen /></RedirectIfAuthed>} />
            {/* The gate. RequireAuth, not RequireActivated: reaching it is the
                point, and RequireActivated would bounce the user back here. */}
            <Route path="/activate" element={<RequireAuth><ActivationScreen /></RequireAuth>} />
            <Route path="/become-a-member" element={<RequireAuth><MembershipRequestScreen /></RequireAuth>} />
            <Route path="/admin-login" element={<AdminLoginScreen />} />
            <Route path="/admin/activation-codes" element={<RequireAdmin><AdminActivationCodesScreen /></RequireAdmin>} />
            <Route path="/admin/membership-requests" element={<RequireAdmin><AdminMembershipRequestsScreen /></RequireAdmin>} />
            <Route path="/login" element={<RedirectIfAuthed><LoginScreen /></RedirectIfAuthed>} />
            <Route path="/signup" element={<RedirectIfAuthed><SignupScreen /></RedirectIfAuthed>} />
            <Route path="/home" element={<RequireActivated><HomeScreen /></RequireActivated>} />
            <Route path="/community" element={<RequireActivated><CommunityPage /></RequireActivated>} />
            <Route path="/create-post" element={<RequireActivated><CreatePostScreen /></RequireActivated>} />
            <Route path="/calculator" element={<RequireActivated><RiskCalculatorScreen /></RequireActivated>} />
            <Route path="/news" element={<RequireActivated><MarketNewsScreen /></RequireActivated>} />
            <Route path="/chat" element={<RequireActivated><ChatListScreen /></RequireActivated>} />
            <Route path="/chat/admin" element={<RequireActivated><AdminChatScreen /></RequireActivated>} />
            <Route path="/profile" element={<RequireActivated><ProfileScreen /></RequireActivated>} />
            <Route path="/profile/personal" element={<RequireActivated><PersonalInformationScreen /></RequireActivated>} />
            <Route path="/profile/name-visibility" element={<RequireActivated><NameVisibilityScreen /></RequireActivated>} />
            <Route path="/profile/privacy" element={<RequireActivated><PrivacyPolicyScreen /></RequireActivated>} />
            <Route path="/profile/terms" element={<RequireActivated><TermsScreen /></RequireActivated>} />
            <Route path="/profile/help" element={<RequireActivated><HelpSupportScreen /></RequireActivated>} />
            {/* /analysis is kept as an alias so links already shared, and the
                browser history of anyone mid-session, keep working. */}
            <Route path="/post" element={<RequireActivated><PostDetailScreen /></RequireActivated>} />
            <Route path="/analysis" element={<RequireActivated><PostDetailScreen /></RequireActivated>} />
            <Route path="/notifications" element={<RequireActivated><NotificationsScreen /></RequireActivated>} />
            <Route path="/admin-inbox" element={<RequireAdmin><AdminInboxScreen /></RequireAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppStateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
