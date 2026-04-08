import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, UserPlus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import PageTransition from "@/components/PageTransition";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { getUserFriendlyError } from "@/lib/errorMessages";
import { RegisterSchema } from "@/lib/validations";

const Register = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    pid: "",
  });
  const [role, setRole] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Input Validation
      const result = RegisterSchema.safeParse(formData);
      if (!result.success) {
        toast.error(result.error.errors[0].message);
        setLoading(false);
        return;
      }
      if (!role) { toast.error("Please select a role"); setLoading(false); return; }

      await signup(formData.email, formData.password, formData.name, role, formData.pid);
      toast.success("Registration successful! Please sign in.");
      navigate("/login");
    } catch (error: any) {
      toast.error(getUserFriendlyError(error, "signup"));
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
            className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5 relative"
          >
            <div className="absolute inset-0 rounded-2xl bg-accent/5 animate-ping" />
            <UserPlus className="w-7 h-7 text-accent relative" />
          </motion.div>
          <h1 className="text-3xl font-display font-bold text-foreground">Create Account</h1>
          <p className="text-sm text-muted-foreground mt-2">Join UniFound today</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
            <Input id="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="John Doe" className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pid" className="text-sm font-medium">PID *</Label>
            <Input id="pid" value={formData.pid} onChange={(e) => setFormData({...formData, pid: e.target.value.toUpperCase()})} placeholder="e.g. AB1234" className="bg-secondary/50 border-border/30 h-11 rounded-xl uppercase tracking-widest" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email" className="text-sm font-medium">Email</Label>
            <Input id="reg-email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} placeholder="you@university.edu" className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reg-password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Input id="reg-password" type={showPass ? "text" : "password"} value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} placeholder="••••••••" className="bg-secondary/50 border-border/30 h-11 rounded-xl pr-11 text-sm" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium">Confirm</Label>
              <Input id="confirm-password" type="password" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} placeholder="••••••••" className="bg-secondary/50 border-border/30 h-11 rounded-xl text-sm" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role" className="text-sm font-medium">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="bg-secondary/50 border-border/30 h-11 rounded-xl">
                <SelectValue placeholder="Select your role" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50 rounded-xl">
                <SelectItem value="user">Student</SelectItem>
                <SelectItem value="admin">Incharge Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="pt-2">
            <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-xl text-base font-semibold glow gap-2">
              {loading ? "Creating..." : <>Create Account <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </motion.div>
        </form>

        <div className="relative my-8">
          <div className="line-glow" />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:text-primary/80 font-semibold transition-colors">Sign in</Link>
        </p>
      </motion.div>
    </PageTransition>
  );
};

export default Register;
