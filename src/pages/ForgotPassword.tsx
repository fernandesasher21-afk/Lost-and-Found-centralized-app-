import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowLeft, Send, KeyRound, Eye, EyeOff, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import PageTransition from "@/components/PageTransition";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ForgotPassword = () => {
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isRecoveryMode = useRef(false);

  // Listen specifically for the PASSWORD_RECOVERY event from Supabase
  // This fires when a user clicks the reset link from their email
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        isRecoveryMode.current = true;
        setStep("reset");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Only redirect to dashboard if NOT in recovery mode
  useEffect(() => {
    if (user && !isRecoveryMode.current) {
      navigate(user.role === "admin" || user.role === "staff" ? "/admin" : "/dashboard");
    }
  }, [user, navigate]);

  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/forgot-password`,
      });

      if (error) throw error;

      setResetLinkSent(true);
      toast.success("Password reset link sent! Check your email.");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast.error("Please fill all fields");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      toast.success("Password updated successfully!");
      // Sign out after password reset for security
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition className="min-h-screen flex items-center justify-center pt-20 pb-10 px-4 relative">
      <div className="absolute inset-0 mesh-bg opacity-50" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md glass-strong rounded-3xl p-8 md:p-10 relative"
      >
        <AnimatePresence mode="wait">
          {step === "email" && !resetLinkSent && (
            <motion.div
              key="email"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="text-center mb-10">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", delay: 0.2, stiffness: 200 }}
                  className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5 relative"
                >
                  <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-ping" />
                  <Mail className="w-7 h-7 text-primary relative" />
                </motion.div>
                <h1 className="text-3xl font-display font-bold text-foreground">Forgot Password?</h1>
                <p className="text-sm text-muted-foreground mt-2">
                  Enter your email to receive a password reset link
                </p>
              </div>

              <form onSubmit={handleSendResetLink} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="bg-secondary/50 border-border/30 h-11 rounded-xl focus:ring-primary/30"
                  />
                </div>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-xl text-base font-semibold glow gap-2"
                  >
                    {loading ? "Sending..." : <>Send Reset Link <Send className="w-4 h-4" /></>}
                  </Button>
                </motion.div>
              </form>

              <div className="relative my-8">
                <div className="line-glow" />
              </div>

              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <Link to="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">
                  Sign in
                </Link>
              </p>
            </motion.div>
          )}

          {step === "email" && resetLinkSent && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="text-center mb-10">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", delay: 0.2, stiffness: 200 }}
                  className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-5 relative"
                >
                  <div className="absolute inset-0 rounded-2xl bg-green-500/5 animate-ping" />
                  <Mail className="w-7 h-7 text-green-500 relative" />
                </motion.div>
                <h1 className="text-3xl font-display font-bold text-foreground">Check Your Email</h1>
                <p className="text-sm text-muted-foreground mt-2">
                  We've sent a password reset link to <span className="text-primary font-medium">{email}</span>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 mb-6">
                <p className="text-sm text-green-600 dark:text-green-400 text-center">
                  The reset link will expire in 1 hour. If you don't see the email, check your spam folder.
                </p>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setResetLinkSent(false);
                  setEmail("");
                }}
                className="w-full gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Try a different email
              </Button>

              <div className="relative my-8">
                <div className="line-glow" />
              </div>

              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <Link to="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">
                  Sign in
                </Link>
              </p>
            </motion.div>
          )}

          {step === "reset" && (
            <motion.div
              key="reset"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", delay: 0.2, stiffness: 200 }}
                  className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5 relative"
                >
                  <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-ping" />
                  <KeyRound className="w-7 h-7 text-primary relative" />
                </motion.div>
                <h1 className="text-3xl font-display font-bold text-foreground">Reset Password</h1>
                <p className="text-sm text-muted-foreground mt-2">Create a new password for your account</p>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-5">
                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-secondary/50 border-border/30 h-11 rounded-xl pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPass ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-secondary/50 border-border/30 h-11 rounded-xl pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password requirements */}
                {password && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="text-xs space-y-1"
                  >
                    <div className={`flex items-center gap-1.5 ${password.length >= 6 ? "text-green-500" : "text-muted-foreground"}`}>
                      {password.length >= 6 && <Check className="w-3 h-3" />}
                      <span>At least 6 characters</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${password === confirmPassword && confirmPassword ? "text-green-500" : "text-muted-foreground"}`}>
                      {password === confirmPassword && confirmPassword && <Check className="w-3 h-3" />}
                      <span>Passwords match</span>
                    </div>
                  </motion.div>
                )}

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-xl text-base font-semibold glow gap-2"
                  >
                    {loading ? "Updating..." : <>Reset Password <ArrowRight className="w-4 h-4" /></>}
                  </Button>
                </motion.div>
              </form>

              <div className="relative my-6">
                <div className="line-glow" />
              </div>

              <Link
                to="/login"
                className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </PageTransition>
  );
};

export default ForgotPassword;