import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Menu, X, Bell, LogOut, User, LogIn, UserPlus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout, isStaffOrAdmin } = useAuth();
  const { unreadCount } = useRealtimeNotifications();
  const location = useLocation();
  const isHomePage = location.pathname === "/";
  const navLinks = [
    { to: "/items", label: "Browse Items", show: !!user && !isHomePage },
    { to: "/report-lost", label: "Report Lost", show: !!user && !isHomePage },
    { to: "/report-found", label: "Report Found", show: !!user && isStaffOrAdmin && !isHomePage },
  ].filter((l) => l.show);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-4 mt-3">
        <div className="glass rounded-2xl border border-border/30 max-w-6xl mx-auto">
          <div className="px-5 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 group">
              <motion.div
                whileHover={{ rotate: 15, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center"
              >
                <Search className="w-4 h-4 text-primary-foreground" />
              </motion.div>
              <span className="font-display text-lg font-bold gradient-text">UniFound</span>
            </Link>

            {/* Scrolling Marquee */}
            <div className="flex-1 mx-4 sm:mx-8 overflow-hidden pointer-events-none select-none">
              <div className="animate-marquee-seamless whitespace-nowrap text-base sm:text-lg font-display font-bold text-red-500">
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
                <span className="pr-20">ST. Francis Institute of Technology (Borivali)</span>
              </div>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link key={link.to} to={link.to}>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive(link.to)
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    {link.label}
                  </motion.div>
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-2">

              {user ? (
                <>
                  <Link to="/notifications">
                    <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                      <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl">
                        <Bell className="w-4 h-4" />
                        {unreadCount > 0 && (
                          <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center animate-glow-pulse">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </Badge>
                        )}
                      </Button>
                    </motion.div>
                  </Link>
                  <Link to={isStaffOrAdmin ? "/admin" : "/dashboard"}>
                    <Button variant="ghost" size="sm" className="gap-2 rounded-xl h-9 text-sm">
                      <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                      {user.name}
                    </Button>
                  </Link>
                  <Link to="/edit-profile">
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive">
                    <LogOut className="w-4 h-4" />
                  </Button>
                </>
              ) : !isHomePage ? (
                <>
                  <Link to="/login">
                    <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 rounded-xl h-9 px-4 font-semibold glow">
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/register">
                    <Button size="sm" variant="outline" className="gap-2 rounded-xl h-9 px-4 font-semibold border-border/40">
                      <UserPlus className="w-4 h-4" />
                      Get Started
                    </Button>
                  </Link>
                </>
              ) : null}
            </div>

            {/* Mobile Toggle & Icons */}
            <div className="flex md:hidden items-center gap-1">
              {user && (
                <Link to="/notifications">
                  <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-xl">
                      <Bell className="w-4 h-4 text-muted-foreground" />
                      {unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center animate-glow-pulse">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                      )}
                    </Button>
                  </motion.div>
                </Link>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="mx-4 mt-2 md:hidden"
          >
            <div className="glass-strong rounded-2xl overflow-hidden max-w-5xl mx-auto">
              <div className="px-4 py-3 space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive(link.to)
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {user ? (
                  <div className="pt-2 mt-2 border-t border-border/30 space-y-2">
                    <div className="flex gap-2">
                      <Link to={isStaffOrAdmin ? "/admin" : "/dashboard"} className="flex-1" onClick={() => setMobileOpen(false)}>
                        <Button variant="ghost" className="w-full gap-2 rounded-xl h-10"><User className="w-4 h-4" />{user.name}</Button>
                      </Link>
                      <Link to="/edit-profile" onClick={() => setMobileOpen(false)}>
                        <Button variant="ghost" size="icon" className="rounded-xl h-10"><Settings className="w-4 h-4" /></Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="rounded-xl h-10" onClick={() => { handleLogout(); setMobileOpen(false); }}>
                        <LogOut className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ) : !isHomePage ? (
                  <div className="pt-2 mt-2 border-t border-border/30 space-y-2">
                    <Link to="/login" onClick={() => setMobileOpen(false)}>
                      <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 rounded-xl h-10 font-semibold">
                        <LogIn className="w-4 h-4" />Sign In
                      </Button>
                    </Link>
                    <Link to="/register" onClick={() => setMobileOpen(false)}>
                      <Button variant="outline" className="w-full gap-2 rounded-xl h-10 font-semibold border-border/40">
                        <UserPlus className="w-4 h-4" />Get Started
                      </Button>
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

export default Navbar;
