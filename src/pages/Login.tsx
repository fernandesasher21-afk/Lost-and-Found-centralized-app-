import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import PageTransition from "@/components/PageTransition";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getUserFriendlyError } from "@/lib/errorMessages";

import { LoginSchema } from "@/lib/validations";

const Login = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate(user.role === "admin" || user.role === "staff" ? "/admin" : "/dashboard");
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Input Validation
      const result = LoginSchema.safeParse({ email: identifier, password });
      if (!result.success) {
        toast.error(result.error.errors[0].message);
        setLoading(false);
        return;
      }

      let email = identifier;
      // If identifier doesn't look like an email, treat it as PID
      if (!identifier.includes("@")) {
        const { data, error } = await supabase
          .from("User")
          .select("email")
          .eq("pid", identifier.toUpperCase())
          .single();
        if (error || !data) {
          toast.error("No account found with that PID");
          setLoading(false);
          return;
        }
        email = data.email;
      }
      await login(email, password);
      toast.success("Logged in successfully!");
    } catch (error: any) {
      toast.error(getUserFriendlyError(error, "login"));
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
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", delay: 0.2, stiffness: 200 }}
            className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5 relative"
          >
            <div className="absolute inset-0 rounded-2xl bg-primary/5 animate-ping" />
            <LogIn className="w-7 h-7 text-primary relative" />
          </motion.div>
          <h1 className="text-3xl font-display font-bold text-foreground">Welcome Back</h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in to your UniFound account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="identifier" className="text-sm font-medium">PID or Email</Label>
            <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Enter your PID or email" className="bg-secondary/50 border-border/30 h-11 rounded-xl focus:ring-primary/30" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Password</Label>
            <div className="relative">
              <Input id="password" type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="bg-secondary/50 border-border/30 h-11 rounded-xl pr-11" />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-xl text-base font-semibold glow gap-2">
              {loading ? "Signing in..." : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </motion.div>
        </form>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
            Forgot Password?
          </Link>
        </div>

        <div className="relative my-8">
          <div className="line-glow" />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary hover:text-primary/80 font-semibold transition-colors">Sign up</Link>
        </p>
      </motion.div>
    </PageTransition>
  );
};

export default Login;
