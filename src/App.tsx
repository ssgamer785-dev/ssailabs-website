import { lazy, Suspense } from 'react';
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
import { LoginScreen } from './screens/LoginScreen';
import { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { SignupScreen } from './screens/SignupScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { NameVisibilityScreen } from './screens/NameVisibilityScreen';
import { AuthLoading } from './components/AuthLoading';
import { HelpSupportScreen } from './screens/HelpSupportScreen';
import { PushNotifications } from './components/PushNotifications';
import { LifecycleSplash } from './components/LifecycleSplash';
import { NotificationNavigation } from './components/NotificationNavigation';
import { AudioPreferencesRuntime } from './components/AudioPreferencesRuntime';
import { PresenceRuntime } from './lib/presence/usePresence';

const AdminActivationCodesScreen = lazy(() => import('./screens/AdminActivationCodesScreen').then(module => ({ default: module.AdminActivationCodesScreen })));
const HomeScreen = lazy(() => import('./screens/HomeScreen').then(module => ({ default: module.HomeScreen })));
const ChatListScreen = lazy(() => import('./screens/ChatListScreen').then(module => ({ default: module.ChatListScreen })));
const AdminMembershipRequestsScreen = lazy(() => import('./screens/AdminMembershipRequestsScreen').then(module => ({ default: module.AdminMembershipRequestsScreen })));
const CommunityPage = lazy(() => import('./screens/CommunityPage').then(module => ({ default: module.CommunityPage })));
const CreatePostScreen = lazy(() => import('./screens/CreatePostScreen').then(module => ({ default: module.CreatePostScreen })));
const RiskCalculatorScreen = lazy(() => import('./screens/RiskCalculatorScreen').then(module => ({ default: module.RiskCalculatorScreen })));
const EconomicCalendarScreen = lazy(() => import('./screens/EconomicCalendarScreen').then(module => ({ default: module.EconomicCalendarScreen })));
const AdminChatRoute = lazy(() => import('./screens/AdminChatScreen').then(module => ({ default: module.AdminChatRoute })));
const PostDetailScreen = lazy(() => import('./screens/PostDetailScreen').then(module => ({ default: module.PostDetailScreen })));
const NotificationsScreen = lazy(() => import('./screens/NotificationsScreen').then(module => ({ default: module.NotificationsScreen })));
const AdminInboxScreen = lazy(() => import('./screens/AdminInboxScreen').then(module => ({ default: module.AdminInboxScreen })));
const PersonalInformationScreen = lazy(() => import('./screens/PersonalInformationScreen').then(module => ({ default: module.PersonalInformationScreen })));
const PrivacyPolicyScreen = lazy(() => import('./screens/PrivacyPolicyScreen').then(module => ({ default: module.PrivacyPolicyScreen })));
const TermsScreen = lazy(() => import('./screens/TermsScreen').then(module => ({ default: module.TermsScreen })));
const HapticsScreen = lazy(() => import('./screens/HapticsScreen').then(module => ({ default: module.HapticsScreen })));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <AppStateProvider>
        <BrowserRouter>
          <AudioPreferencesRuntime />
          <LifecycleSplash />
          <NotificationNavigation />
          <PushNotifications />
          <PresenceRuntime />
          <Suspense fallback={<AuthLoading />}><Routes>
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
            <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
            <Route path="/reset-password" element={<ResetPasswordScreen />} />
            <Route path="/signup" element={<RedirectIfAuthed><SignupScreen /></RedirectIfAuthed>} />
            <Route path="/home" element={<RequireActivated><HomeScreen /></RequireActivated>} />
            <Route path="/community" element={<RequireActivated><CommunityPage /></RequireActivated>} />
            <Route path="/create-post" element={<RequireActivated><CreatePostScreen /></RequireActivated>} />
            <Route path="/calculator" element={<RequireActivated><RiskCalculatorScreen /></RequireActivated>} />
            {/* /news is kept as an alias: the News tab is gone, but a bookmark
                or a back-button entry pointing at the old path should still land
                on the feature that survived it. */}
            <Route path="/economic-calendar" element={<RequireActivated><EconomicCalendarScreen /></RequireActivated>} />
            <Route path="/news" element={<Navigate to="/economic-calendar" replace />} />
            <Route path="/chat" element={<RequireActivated><ChatListScreen /></RequireActivated>} />
            <Route path="/chat/admin" element={<RequireActivated><AdminChatRoute /></RequireActivated>} />
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
            <Route path="/haptics" element={<RequireActivated><HapticsScreen /></RequireActivated>} />
            <Route path="/admin-inbox" element={<RequireAdmin><AdminInboxScreen /></RequireAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes></Suspense>
        </BrowserRouter>
      </AppStateProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
