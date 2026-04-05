import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Search, MapPin, Shield, Bell, ArrowRight, Sparkles, Package, Users, LogIn, UserPlus, ClipboardList, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageTransition from "@/components/PageTransition";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import heroBg from "@/assets/hero-bg.jpg";

const features = [
  { icon: Search, title: "Smart Search", desc: "Find your lost items quickly with powerful filters and category-based search.", step: "01" },
  { icon: MapPin, title: "Location Tracking", desc: "Pin the exact location where items were lost or found on campus.", step: "02" },
  { icon: Shield, title: "Verified Claims", desc: "Secure claim process with admin verification to ensure rightful returns.", step: "03" },
  { icon: Bell, title: "Instant Alerts", desc: "Get notified when a matching item is found or your claim is updated.", step: "04" },
];

const stagger = {
  animate: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

const Index = () => {
  const { user, isStaffOrAdmin } = useAuth();
  const [stats, setStats] = useState([
    { value: "0", label: "Items Recovered" },
    { value: "0", label: "Active Users" },
    { value: "0%", label: "Recovery Rate" },
    { value: "100%", label: "Covers College Premises" },
  ]);

  useEffect(() => {
    const fetchStats = async () => {
      const [foundRes, usersRes, lostRes] = await Promise.all([
        supabase.from("Found_Item").select("found_id", { count: "exact", head: true }),
        supabase.from("User").select("id", { count: "exact", head: true }),
        supabase.from("Lost_Item").select("lost_id, status", { count: "exact", head: false }),
      ]);

      const recovered = foundRes.count ?? 0;
      const activeUsers = usersRes.count ?? 0;
      const lostItems = lostRes.data ?? [];
      const totalLost = lostItems.length;
      const resolvedLost = lostItems.filter((i) => i.status === "resolved" || i.status === "claimed").length;
      const rate = totalLost > 0 ? Math.round((resolvedLost / totalLost) * 100) : 0;

      setStats([
        { value: recovered > 0 ? `${recovered}+` : "0", label: "Items Recovered" },
        { value: activeUsers >= 1000 ? `${(activeUsers / 1000).toFixed(1)}K+` : `${activeUsers}+`, label: "Active Users" },
        { value: "95%", label: "Recovery Rate" },
        { value: "100%", label: "Covers College Premises" },
      ]);
    };
    fetchStats();

    const channel = supabase
      .channel("user-signup-stats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "User" }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <PageTransition>
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0">
          <img src={heroBg} alt="" className="w-full h-full object-cover opacity-50 scale-105" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background" />
          <div className="absolute inset-0 mesh-bg" />
        </div>

        {/* Floating orbs - more dramatic */}
        <motion.div
          animate={{ y: [-20, 20, -20], x: [-10, 10, -10] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/5 w-80 h-80 rounded-full bg-primary/8 blur-[100px]"
        />
        <motion.div
          animate={{ y: [20, -30, 20], x: [10, -10, 10] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full bg-accent/6 blur-[120px]"
        />
        <motion.div
          animate={{ y: [-15, 25, -15] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 4 }}
          className="absolute top-1/2 right-1/3 w-64 h-64 rounded-full bg-destructive/4 blur-[80px]"
        />

        <div className="container relative z-10 px-4 pt-28 pb-20">
          <motion.div variants={stagger} initial="initial" animate="animate" className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-primary/20 bg-primary/5 mb-10 backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-sm font-medium text-primary/90 tracking-wide">University Lost & Found Platform</span>
            </motion.div>

            {/* Heading */}
            <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold leading-[0.95] mb-8 text-balance">
              Lost Something?{" "}
              <br className="hidden sm:block" />
              <span className="gradient-text">We'll Help</span>
              <br />
              You Find It.
            </motion.h1>

            {/* Subtitle */}
            <motion.p variants={fadeUp} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed">
              UniFound is your campus companion for reporting, tracking, and recovering lost items.
              Powered by smart matching and verified claims.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
              {user ? (
                <>
                  <Link to="/report-lost">
                    <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2.5 text-base px-8 h-12 glow rounded-xl font-semibold">
                        <Package className="w-5 h-5" />
                        Report Lost Item
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  </Link>
                  {isStaffOrAdmin && (
                    <Link to="/report-found">
                      <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                        <Button size="lg" variant="outline" className="gap-2.5 text-base px-8 h-12 border-accent/30 text-accent hover:bg-accent/10 rounded-xl font-semibold">
                          <ClipboardList className="w-5 h-5" />
                          Report Found Item
                        </Button>
                      </motion.div>
                    </Link>
                  )}
                  <Link to="/items">
                    <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" variant="outline" className="gap-2.5 text-base px-8 h-12 border-border/40 rounded-xl font-semibold">
                        <Search className="w-5 h-5" />
                        Browse Items
                      </Button>
                    </motion.div>
                  </Link>
                </>
              ) : (
                <>
                  <Link to="/login">
                    <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2.5 text-base px-8 h-12 glow rounded-xl font-semibold">
                        <LogIn className="w-5 h-5" />
                        Sign In
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  </Link>
                  <Link to="/register">
                    <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" variant="outline" className="gap-2.5 text-base px-8 h-12 border-border/40 rounded-xl font-semibold">
                        <UserPlus className="w-5 h-5" />
                        Get Started
                      </Button>
                    </motion.div>
                  </Link>
                </>
              )}
            </motion.div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto"
          >
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                whileHover={{ y: -6, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="glass rounded-2xl p-6 text-center group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <div className="text-3xl md:text-4xl font-display font-bold gradient-text">{s.value}</div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-2 font-medium">{s.label}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="flex justify-center mt-16"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="text-muted-foreground/40"
            >
              <ChevronDown className="w-6 h-6" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Divider */}
      <div className="line-glow mx-auto max-w-lg" />

      {/* Features */}
      <section className="py-28 relative">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <span className="text-primary text-sm font-semibold tracking-widest uppercase mb-4 block">How it works</span>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-5 text-balance">
              How <span className="gradient-text">UniFound</span> Works
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg leading-relaxed">
              A streamlined process to reunite you with your belongings.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.12, duration: 0.6 }}
                whileHover={{ y: -10 }}
                className="glass rounded-2xl p-7 group cursor-pointer relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-13 h-13 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                      <f.icon className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-4xl font-display font-bold text-border/80 group-hover:text-primary/20 transition-colors">{f.step}</span>
                  </div>
                  <h3 className="font-display font-semibold text-lg mb-3 text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="line-glow mx-auto max-w-lg" />

      {/* About Section */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 mesh-bg opacity-50" />
        
        <div className="container px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <span className="text-accent text-sm font-semibold tracking-widest uppercase mb-4 block">About us</span>
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-5 text-balance">
              About <span className="gradient-text">UniFound</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg leading-relaxed">
              A purpose-built platform connecting students, staff, and campus communities to recover what matters most.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                icon: Users,
                title: "Community-Driven",
                desc: "Built by students, for students. Our platform thrives on collective participation — every report brings someone closer to finding what they lost.",
                gradient: "from-primary/10 to-primary/5",
              },
              {
                icon: Shield,
                title: "Trusted & Secure",
                desc: "Every claim goes through a verified process managed by campus staff, ensuring items are returned to their rightful owners safely.",
                gradient: "from-accent/10 to-accent/5",
              },
              {
                icon: Sparkles,
                title: "Our Mission",
                desc: "We believe no lost item should stay lost. UniFound's mission is to create a caring, connected campus where honesty and helpfulness prevail.",
                gradient: "from-warning/10 to-warning/5",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.15, duration: 0.6 }}
                whileHover={{ y: -10 }}
                className="glass rounded-2xl p-8 text-center group relative overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative">
                  <motion.div
                    whileHover={{ rotate: 10, scale: 1.1 }}
                    className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/15 transition-all duration-300"
                  >
                    <item.icon className="w-8 h-8 text-primary" />
                  </motion.div>
                  <h3 className="font-display font-semibold text-xl mb-4 text-foreground">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Quote */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-20 glass-strong rounded-3xl p-12 md:p-16 text-center max-w-3xl mx-auto relative overflow-hidden"
          >
            <div className="absolute inset-0 mesh-bg opacity-30" />
            <div className="relative">
              <div className="text-5xl text-primary/20 font-display mb-4">"</div>
              <p className="text-lg md:text-xl text-muted-foreground italic leading-relaxed mb-8">
                Every item returned is a story of honesty and community. Together, we make our campus a better place — one found belonging at a time.
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="w-10 h-[1px] bg-primary/30" />
                <span className="text-sm font-semibold text-primary tracking-wide">The UniFound Team</span>
                <div className="w-10 h-[1px] bg-primary/30" />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <div className="line-glow mx-auto max-w-lg" />
      <footer className="py-10 relative">
        <div className="container px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Search className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg gradient-text">UniFound</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 UniFound. All rights reserved.</p>
        </div>
      </footer>
    </PageTransition>
  );
};

export default Index;
