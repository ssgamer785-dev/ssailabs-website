import React, { useState } from "react";
import { 
  Lock, 
  User, 
  Sparkles, 
  Eye, 
  EyeOff, 
  Scissors, 
  ArrowRight,
  ShieldCheck,
  QrCode,
  UserPlus,
  Mail,
  Briefcase
} from "lucide-react";
import { supabase } from "../supabase";
import { db } from "../db";
import SignatureLogo from "./SignatureLogo";

interface LoginScreenProps {
  onLoginSuccess: (role: "Admin" | "Staff") => void;
  onBypassToPortal: () => void;
  onGoToAttendanceKiosk?: () => void;
}

export default function LoginScreen({ onLoginSuccess, onBypassToPortal, onGoToAttendanceKiosk }: LoginScreenProps) {
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  
  // Sign In state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  // Sign Up state
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpRole, setSignUpRole] = useState<"Admin" | "Staff">("Staff");
  
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Map previous mock credentials to real email addresses for backward compatibility
    let finalEmail = username.trim();
    let finalPassword = password.trim();

    if (finalEmail.toUpperCase() === "ADMIN_SIGNATURE") {
      finalEmail = "escortstakes@gmail.com";
      // If they type Sunil@1956 but have not signed up yet, we will auto-register them below
    } else if (finalEmail.toUpperCase() === "SIGNATURE") {
      finalEmail = "harjeet@signaturesuitings.com";
    }

    try {
      // 1. Attempt standard Supabase Authentication sign-in
      let { data, error: authError } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password: finalPassword
      });

      // 2. Self-healing/Auto-registration for default credentials
      if (
        authError && 
        (authError.message.includes("Invalid login credentials") || authError.message.includes("User not found")) &&
        (finalEmail === "escortstakes@gmail.com" || finalEmail === "harjeet@signaturesuitings.com")
      ) {
        console.log("Pre-creating default legacy user in Supabase Auth...");
        const defaultName = finalEmail === "escortstakes@gmail.com" ? "Hardik Nagpal" : "Harjeet Singh";
        const defaultRole = finalEmail === "escortstakes@gmail.com" ? "Admin" : "Staff";
        
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: finalEmail,
          password: finalPassword,
          options: {
            data: {
              name: defaultName,
              role: defaultRole
            }
          }
        });

        if (!signUpError && signUpData.user) {
          // Store user record in users table
          db.addUser({
            name: defaultName,
            role: defaultRole,
            email: finalEmail,
            phone: finalEmail === "escortstakes@gmail.com" ? "93572 51900" : "98721 98721",
            active: true
          });

          // Re-try authenticating
          const retry = await supabase.auth.signInWithPassword({
            email: finalEmail,
            password: finalPassword
          });
          data = retry.data;
          authError = retry.error;
        }
      }

      if (authError) {
        setError(authError.message || "Invalid credentials. Please verify your Email and Gatekeeper Password.");
        setIsLoading(false);
        return;
      }

      if (data && data.user) {
        // Resolve user role
        let role: "Admin" | "Staff" = "Staff";
        const email = data.user.email;
        if (email) {
          const match = db.getUsers().find(u => u.email === email);
          if (match) {
            role = match.role;
          } else if (data.user.user_metadata?.role) {
            role = data.user.user_metadata.role;
          }
        }
        onLoginSuccess(role);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during authentication.");
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: signUpEmail.trim(),
        password: signUpPassword.trim(),
        options: {
          data: {
            name: signUpName.trim(),
            role: signUpRole
          }
        }
      });

      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }

      if (data && data.user) {
        // Add new user record to user profiles database table
        db.addUser({
          name: signUpName.trim(),
          role: signUpRole,
          email: signUpEmail.trim(),
          phone: "",
          active: true
        });

        onLoginSuccess(signUpRole);
      } else {
        setError("Account registration initiated. Check your email for validation link.");
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during account creation.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1329] text-white font-sans flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Decorative ambient background elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gold/5 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-navy-light/10 blur-[120px]" />

      <div className="w-full max-w-md bg-white rounded-[32px] border border-gold/15 shadow-2xl overflow-hidden relative z-10 transition-all duration-300">
        
        {/* Luxury top accent bar */}
        <div className="h-2 bg-gradient-to-r from-gold via-yellow-300 to-gold" />

        <div className="p-8 sm:p-10 flex flex-col items-center">
          
          {/* Logo container using premium SignatureLogo */}
          <div className="mb-6 flex justify-center items-center">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border border-gold/40 flex items-center justify-center bg-black shadow-inner p-1">
              <SignatureLogo size={72} iconOnly={true} className="w-full h-full object-contain" />
            </div>
          </div>

          <h1 className="font-serif text-2xl font-black tracking-widest text-[#0a192f] text-center uppercase">
            SIGNATURE
          </h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#d4af37] font-bold font-sans mt-1">
            Suitings &bull; Showroom Gate
          </p>
          
          {/* Authentic Tab Switcher */}
          <div className="flex bg-cream/30 p-1 rounded-xl w-full mt-6 mb-4 border border-light">
            <button
              type="button"
              onClick={() => {
                setActiveTab("signin");
                setError("");
              }}
              className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === "signin" 
                  ? "bg-[#0a192f] text-white shadow-xs" 
                  : "text-muted-grey hover:text-[#0a192f]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("signup");
                setError("");
              }}
              className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeTab === "signup" 
                  ? "bg-[#0a192f] text-white shadow-xs" 
                  : "text-muted-grey hover:text-[#0a192f]"
              }`}
            >
              Register Staff
            </button>
          </div>

          {activeTab === "signin" ? (
            <form onSubmit={handleLogin} className="w-full space-y-4">
              {/* Username/Email Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-navy">
                  Email or Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#d4af37] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    required
                    placeholder="ADMIN_SIGNATURE or email@example.com"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-cream/20 text-[#0a192f] pl-11 pr-4 py-3 border border-light rounded-xl focus:outline-hidden focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] text-xs font-semibold placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-navy">
                  Gatekeeper Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#d4af37] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-cream/20 text-[#0a192f] pl-11 pr-11 py-3 border border-light rounded-xl focus:outline-hidden focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] text-xs font-mono font-semibold placeholder:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-grey hover:text-[#0a192f] focus:outline-hidden cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[11px] font-medium leading-relaxed">
                    {error}
                  </div>
                  {error.toLowerCase().includes("confirm") && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2 text-left">
                      <p className="font-bold flex items-center gap-1.5 text-amber-800">
                        <span>💡</span> Showroom Offline Override
                      </p>
                      <p className="leading-relaxed opacity-90 text-[11px] text-amber-800">
                        Your credentials are valid! Since email confirmation is pending, you can access the showroom in <strong>Local Offline Mode</strong> immediately. All additions and changes will still be saved locally on this device.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const lowerUser = username.trim().toLowerCase();
                          const resolvedRole = (lowerUser === "admin_signature" || lowerUser === "escortstakes@gmail.com") ? "Admin" : "Staff";
                          onLoginSuccess(resolvedRole);
                        }}
                        className="w-full py-2.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold font-sans transition-all text-center flex items-center justify-center gap-1 cursor-pointer text-[11px] shadow-xs"
                      >
                        <span>Access Showroom in Offline Mode</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#0a192f] hover:bg-[#112240] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-75 disabled:transform-none cursor-pointer mt-4"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying Security Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Unlock Workspace</span>
                    <ArrowRight className="w-4 h-4 text-gold" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="w-full space-y-4">
              {/* Full Name Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-navy">
                  Staff Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#d4af37] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    required
                    placeholder="E.g. Hardik Nagpal"
                    value={signUpName}
                    onChange={(e) => {
                      setSignUpName(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-cream/20 text-[#0a192f] pl-11 pr-4 py-3 border border-light rounded-xl focus:outline-hidden focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] text-xs font-semibold placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-navy">
                  Work Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#d4af37] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="email" 
                    required
                    placeholder="email@signaturesuitings.com"
                    value={signUpEmail}
                    onChange={(e) => {
                      setSignUpEmail(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-cream/20 text-[#0a192f] pl-11 pr-4 py-3 border border-light rounded-xl focus:outline-hidden focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] text-xs font-semibold placeholder:text-gray-400"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-navy">
                  Select Secret Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#d4af37] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    value={signUpPassword}
                    onChange={(e) => {
                      setSignUpPassword(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-cream/20 text-[#0a192f] pl-11 pr-11 py-3 border border-light rounded-xl focus:outline-hidden focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] text-xs font-mono font-semibold placeholder:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-grey hover:text-[#0a192f] focus:outline-hidden cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider font-bold text-navy">
                  Showroom Role Assignment
                </label>
                <div className="relative">
                  <Briefcase className="w-4 h-4 text-[#d4af37] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <select
                    value={signUpRole}
                    onChange={(e) => setSignUpRole(e.target.value as "Admin" | "Staff")}
                    className="w-full bg-cream/20 text-[#0a192f] pl-11 pr-4 py-3 border border-light rounded-xl focus:outline-hidden focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] text-xs font-semibold"
                  >
                    <option value="Staff">Showroom Tailor / Staff</option>
                    <option value="Admin">Showroom Owner (Admin)</option>
                  </select>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[11px] font-medium leading-relaxed">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#0a192f] hover:bg-[#112240] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-75 disabled:transform-none cursor-pointer mt-4"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Registering Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Staff Account</span>
                    <UserPlus className="w-4 h-4 text-gold" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Luxury Footnote */}
          <div className="mt-6 pt-5 border-t border-light w-full flex flex-col items-center gap-3 text-center">
            <button
              type="button"
              onClick={onBypassToPortal}
              className="text-[#d4af37] hover:text-[#0a192f] text-[10px] uppercase tracking-wider font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer group"
            >
              <QrCode className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
              <span>Are you a client? Go to Customer Portal</span>
            </button>

            {onGoToAttendanceKiosk && (
              <button
                type="button"
                onClick={onGoToAttendanceKiosk}
                className="text-navy hover:text-[#d4af37] text-[10px] uppercase tracking-wider font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer group mt-1"
              >
                <Scissors className="w-3.5 h-3.5 group-hover:rotate-12 text-[#d4af37] transition-transform" />
                <span>Staff/Worker Daily Attendance Kiosk</span>
              </button>
            )}
          </div>

        </div>
      </div>

      <div className="mt-6 flex items-center gap-1.5 text-[#d4af37]/60 text-[10px] tracking-widest font-mono select-none">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>SECURE END-TO-END SUPABASE AUTHENTICATION</span>
      </div>
    </div>
  );
}
