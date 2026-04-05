import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role?: string, pid?: string) => Promise<void>;
  logout: () => void;
  isStaffOrAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (supaUser: User) => {
    const { data } = await supabase
      .from("User")
      .select("*")
      .eq("id", supaUser.id)
      .single();

    // Fetch role from user_roles table
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", supaUser.id);

    const roles = roleData?.map((r) => r.role) || [];
    const effectiveRole = roles.includes("admin") ? "admin" : roles.includes("moderator") ? "moderator" : "user";

    if (data) {
      setUser({
        id: data.id,
        name: data.name || supaUser.user_metadata?.name || supaUser.email?.split("@")[0] || "",
        email: data.email,
        role: effectiveRole,
      });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Use setTimeout to avoid deadlock with Supabase auth
          setTimeout(() => fetchProfile(session.user), 0);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signup = async (email: string, password: string, name: string, role: string = "user", pid?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role, pid: pid?.toUpperCase() },
      },
    });
    if (error) throw error;
  };

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = () => {
    supabase.auth.signOut();
    setUser(null);
  };

  const isStaffOrAdmin = user?.role === "admin" || user?.role === "staff";

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, isStaffOrAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
