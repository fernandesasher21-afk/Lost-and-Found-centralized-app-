import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Package, Eye, ClipboardCheck, Bell, Users, Plus, CheckCircle, XCircle, Search, Percent, User, Send, History, Trash2, Undo2, X, Zap, Activity, Clock, MapPin, Calendar, Smartphone, Laptop, Watch, Glasses, Key, Briefcase, Info, MousePointer2, Image as ImageIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useSearchParams } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// Helper components for aesthetics
const NumberTicker = ({ value }: { value: number }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    let totalDuration = 1000;
    let increment = end / (totalDuration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setDisplayValue(end);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayValue}</span>;
};

const ScanLine = () => (
  <motion.div 
    initial={{ top: -10 }}
    animate={{ top: "110%" }}
    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
    className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent z-10 opacity-50 shadow-[0_0_10px_rgba(var(--primary),0.8)]"
  />
);

// Helper function to send email notification
const sendEmailNotification = async (userId: string, message: string, type: string, itemName?: string) => {
  try {
    await supabase.functions.invoke("send-notification-email", {
      body: { userId, message, type, itemName },
    });
  } catch (error) {
    console.error("Failed to send email notification:", error);
  }
};

const statusColors: Record<string, string> = {
  Lost: "bg-destructive/20 text-destructive",
  Found: "bg-primary/20 text-primary",
  Matched: "bg-accent/20 text-accent",
  Returned: "bg-success/20 text-success",
  Claimed: "bg-warning/20 text-warning",
  pending: "bg-accent/20 text-accent",
  approved: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
};

interface LostItem {
  lost_id: number;
  name: string | null;
  category: string;
  subcategory: string | null;
  status: string | null;
  location: string | null;
  date_lost: string | null;
  description: string | null;
  user_id: string | null;
  image_path: string | null;
  lost_embedding: string | null;
  text_embedding?: string | null;
  ai_description: string | null;
  reporter_name?: string | null;
  reporter_email?: string | null;
  reporter_pid?: string | null;
}

interface FoundItem {
  found_id: number;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  status: string;
  location: string | null;
  date_found: string | null;
  description: string | null;
  image_path: string | null;
  found_embedding: string | null;
  text_embedding?: string | null;
  ai_description: string | null;
}

interface ClaimRow {
  claim_id: number;
  item_id: number | null;
  user_id: string | null;
  claim_status: string | null;
  verification_details: string | null;
  claim_date: string | null;
  created_at: string | null;
  claimer_name?: string;
  claimer_email?: string;
  claimer_pid?: string;
  claimer_avatar?: string | null;
  item_name?: string;
}

interface MatchResult {
  lostItem: LostItem;
  similarity: number;
  reasons: string[];
  matchType?: "photo" | "text";
}

function parseDescriptionFields(desc: string | null): Record<string, string> {
  if (!desc) return {};
  const fields: Record<string, string> = {};
  const parts = desc.includes(" | ") ? desc.split(" | ") : desc.split("\n");
  
  for (const part of parts) {
    const colonIdx = part.indexOf(": ");
    if (colonIdx > 0) {
      const key = part.substring(0, colonIdx).toLowerCase().trim();
      fields[key] = part.substring(colonIdx + 2).trim();
    }
  }
  
  if (fields["description"]) {
    fields["_text"] = fields["description"].toLowerCase();
  } else if (parts.length > 0 && !parts[0].includes(": ")) {
    fields["_text"] = parts[0].toLowerCase().trim();
  }
  return fields;
}

function calculateMatch(lost: LostItem, found: FoundItem): MatchResult {
  let score = 0;
  let total = 0;
  const reasons: string[] = [];

  const lostFields = parseDescriptionFields(lost.description);
  const foundFields = parseDescriptionFields(found.description);

  let lostCat = (lost.category || lostFields["category"] || "").toLowerCase();
  let lostSubcat = (lost.subcategory || lostFields["subcategory"] || "").toLowerCase();
  
  if (lostCat.includes(" - ")) {
    const [cat, sub] = lostCat.split(" - ");
    lostCat = cat.trim();
    lostSubcat = sub.trim();
  }

  const foundCat = (found.category || "").toLowerCase();
  const foundSubcat = (found.subcategory || "").toLowerCase();

  total += 30;
  if (lostCat && foundCat) {
    if (lostCat === foundCat) {
      score += 30;
      reasons.push("Category match");
    } else {
      return { lostItem: lost, similarity: 0, reasons: ["Category mismatch"] };
    }
  }

  if (lostSubcat || foundSubcat) {
    total += 20;
    if (lostSubcat === foundSubcat) {
      score += 20;
      reasons.push("Subcategory match");
    } else if (lostSubcat && foundSubcat) {
      score -= 25;
      reasons.push("Identity mismatch");
    }
  }

  const lostName = (lost.name || lostFields["name"] || "").toLowerCase();
  const foundName = (found.name || "").toLowerCase();
  
  if (lostName || foundName) {
    total += 25;
    if (lostName && foundName) {
      if (lostName === foundName || foundName.includes(lostName) || lostName.includes(foundName)) {
        score += 25;
        reasons.push("Name match");
      } else {
        const lostWords = lostName.split(/\s+/).filter(w => w.length > 2);
        const foundWords = foundName.split(/\s+/).filter(w => w.length > 2);
        const shared = lostWords.filter(w => foundWords.some(fw => fw.includes(w) || w.includes(fw)));
        
        if (shared.length > 0) {
          score += 15;
          reasons.push("Partial name match");
        } else {
          score -= 30;
          reasons.push("Different items");
        }
      }
    }
  }

  let lostLoc = (lost.location || lostFields["location"] || "").toLowerCase();
  if (lostLoc) {
    total += 15;
    const fl = (found.location || "").toLowerCase();
    if (lostLoc === fl) {
      score += 15;
      reasons.push("Location identical");
    } else if (fl.includes(lostLoc) || lostLoc.includes(fl)) {
      score += 10;
      reasons.push("Related location");
    }
  }

  const lostColor = (lostFields["color"] || "").toLowerCase();
  const foundColor = (foundFields["color"] || "").toLowerCase();
  if (lostColor) {
    total += 4;
    if (foundColor && lostColor === foundColor) {
      score += 4;
      reasons.push("Color match");
    }
  }

  const lostBrand = (lostFields["brand"] || "").toLowerCase();
  const foundBrand = (foundFields["brand"] || "").toLowerCase();
  if (lostBrand) {
    total += 4;
    if (foundBrand && (lostBrand === foundBrand || lostBrand.includes(foundBrand) || foundBrand.includes(lostBrand))) {
      score += 4;
      reasons.push("Brand identity");
    }
  }

  let lostDate = (lost.date_lost || lostFields["date lost"] || "").toLowerCase();
  if (lostDate && found.date_found) {
    total += 5;
    const diffDays = Math.abs(new Date(found.date_found).getTime() - new Date(lostDate).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) { score += 5; reasons.push("Same day"); }
    else if (diffDays <= 3) { score += 3; reasons.push("Close date"); }
  }

  const percentage = total > 0 ? Math.max(0, Math.round((score / total) * 100)) : 0;
  return { lostItem: lost, similarity: percentage / 100, reasons };
}

const AdminDashboard = () => {
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") as any) || "overview";
  const [tab, setTab] = useState<"overview" | "claims" | "lost" | "found" | "matching" | "history">(initialTab);
  const [lostItems, setLostItems] = useState<LostItem[]>([]);
  const [foundItems, setFoundItems] = useState<FoundItem[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();

  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageTarget, setMessageTarget] = useState<{ userId: string; name: string; context: string } | null>(null);
  const [matchMessage, setMatchMessage] = useState("");

  const [claimMessageDialogOpen, setClaimMessageDialogOpen] = useState(false);
  const [claimMessageTarget, setClaimMessageTarget] = useState<{ userId: string; name: string } | null>(null);
  const [expandedClaimId, setExpandedClaimId] = useState<number | null>(null);
  const [claimMessage, setClaimMessage] = useState("");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) setTab(tabParam as any);
  }, [searchParams]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [lostRes, foundRes, claimsRes] = await Promise.all([
      supabase.from("Lost_Item").select("*"),
      supabase.from("Found_Item").select("*"),
      supabase.from("Claim").select("*").order("created_at", { ascending: false }),
    ]);

    let lostWithNames: LostItem[] = [];
    if (lostRes.data) {
      const userIds = [...new Set(lostRes.data.filter(i => i.user_id).map(i => i.user_id!))];
      let userMap: Record<string, { name: string; email: string; pid: string }> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase.from("User").select("id, name, email, pid").in("id", userIds);
        if (users) userMap = Object.fromEntries(users.map(u => [u.id, { name: u.name || "Unknown", email: u.email, pid: (u as any).pid || "" }]));
      }
      lostWithNames = lostRes.data.map(item => ({ 
        ...item, 
        reporter_name: item.user_id ? (userMap[item.user_id]?.name || "Unknown") : null,
        reporter_email: item.user_id ? (userMap[item.user_id]?.email || null) : null,
        reporter_pid: item.user_id ? (userMap[item.user_id]?.pid || null) : null
      }));
    }

    setLostItems(lostWithNames);
    if (foundRes.data) setFoundItems(foundRes.data);

    if (claimsRes.data) {
      const claimUserIds = [...new Set(claimsRes.data.filter(c => c.user_id).map(c => c.user_id!))];
      let claimUserMap: Record<string, { name: string; email: string; pid: string; avatar_url: string | null }> = {};
      if (claimUserIds.length > 0) {
        const { data: users } = await supabase.from("User").select("id, name, email, pid, avatar_url").in("id", claimUserIds);
        if (users) claimUserMap = Object.fromEntries(users.map(u => [u.id, { name: u.name || "Unknown", email: u.email, pid: (u as any).pid || "", avatar_url: (u as any).avatar_url || null }]));
      }
      const foundData = foundRes.data || [];
      setClaims(claimsRes.data.map(c => ({
        ...c,
        claimer_name: c.user_id ? (claimUserMap[c.user_id]?.name || "Unknown") : "Unknown",
        claimer_email: c.user_id ? (claimUserMap[c.user_id]?.email || "") : "",
        claimer_pid: c.user_id ? (claimUserMap[c.user_id]?.pid || "") : "",
        claimer_avatar: c.user_id ? (claimUserMap[c.user_id]?.avatar_url || null) : null,
        item_name: foundData.find(f => f.found_id === c.item_id)?.name || foundData.find(f => f.found_id === c.item_id)?.category || "Unknown Item",
      })));
    }
    setLoading(false);
  };

  const [selectedFoundItem, setSelectedFoundItem] = useState<FoundItem | null>(null);
  const [matchingLostItems, setMatchingLostItems] = useState<MatchResult[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);

  const computeMatchesForFoundItem = async (foundItem: FoundItem) => {
    setMatchingLoading(true);
    setSelectedFoundItem(foundItem);
    const results: MatchResult[] = [];
    let hasGoodPhotoMatch = false;
    let hasGoodTextAiMatch = false;

    const isValidDateMatch = (lostDateStr: string | null, foundDateStr: string | null) => {
      if (!lostDateStr || !foundDateStr) return true;
      const lostDate = new Date(lostDateStr);
      const foundDate = new Date(foundDateStr);
      lostDate.setUTCHours(0, 0, 0, 0);
      foundDate.setUTCHours(0, 0, 0, 0);
      return Math.round((lostDate.getTime() - foundDate.getTime()) / (1000 * 60 * 60 * 24)) <= 1;
    };

    if (foundItem.found_embedding) {
      const { data: embeddingMatches } = await supabase.rpc("match_found_to_lost", {
        _embedding: foundItem.found_embedding,
        _subcategory: foundItem.subcategory || foundItem.category || "",
        _limit: 10,
      });
      if (embeddingMatches) {
        for (const m of embeddingMatches) {
          if (!isValidDateMatch(m.date_lost, foundItem.date_found)) continue;
          if (m.similarity >= 0.80) {
            hasGoodPhotoMatch = true;
            results.push({ lostItem: m as any, similarity: m.similarity, reasons: ["Visual match"], matchType: "photo" });
          }
        }
      }
    }

    if (!hasGoodPhotoMatch && foundItem.text_embedding) {
      const { data: textMatches } = await supabase.rpc("match_found_to_lost_text", {
        _embedding: foundItem.text_embedding,
        _subcategory: foundItem.subcategory || foundItem.category || "",
        _limit: 10,
      });
      if (textMatches) {
        for (const m of textMatches) {
          if (!isValidDateMatch(m.date_lost, foundItem.date_found)) continue;
          if (m.similarity >= 0.40) {
            hasGoodTextAiMatch = true;
            if (results.find(r => r.lostItem.lost_id === (m as any).lost_id)) continue;
            results.push({ lostItem: m as any, similarity: m.similarity, reasons: ["AI Text match"], matchType: "text" });
          }
        }
      }
    }

    if (!hasGoodPhotoMatch && !hasGoodTextAiMatch) {
      for (const lost of lostItems) {
        if (lost.status !== "Lost") continue;
        if (!isValidDateMatch(lost.date_lost, foundItem.date_found)) continue;
        const match = calculateMatch(lost, foundItem);
        if (match.similarity >= 0.40) results.push({...match, matchType: "text"});
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    setMatchingLostItems(results);
    setMatchingLoading(false);
  };

  const handleUpdateClaimStatus = async (claimId: number, status: string) => {
    const claim = claims.find(c => c.claim_id === claimId);
    const { error } = await supabase.from("Claim").update({ claim_status: status }).eq("claim_id", claimId);
    if (!error && claim?.user_id) {
      let message = status === "approved" 
        ? `✅ Your claim for "${claim.item_name}" has been approved! Visit the Cell to collect.` 
        : `❌ Your claim for "${claim.item_name}" was rejected. Please visit the Cell for details.`;
      await supabase.from("notifications").insert({ user_id: claim.user_id, message, status: "unread", type: "claim_update", sender_id: currentUser?.id });
      sendEmailNotification(claim.user_id, message, "claim_update", claim.item_name);
      toast.success(`Claim ${status}!`);
      fetchData();
    }
  };

  const handleDeleteLostItem = async (lostId: number) => {
    if ((await supabase.from("Lost_Item").delete().eq("lost_id", lostId)).error) toast.error("Delete failed");
    else { toast.success("Deleted"); fetchData(); }
  };

  const handleDeleteFoundItem = async (foundId: number) => {
    if ((await supabase.from("Found_Item").delete().eq("found_id", foundId)).error) toast.error("Delete failed. It might have active claims.");
    else { toast.success("Deleted"); fetchData(); }
  };

  const handleMarkAsRecovered = async (foundId: number) => {
    const { error } = await supabase.from("Found_Item").update({ status: "Returned" }).eq("found_id", foundId);
    if (error) toast.error("Failed to update status");
    else { toast.success("Item marked as recovered"); fetchData(); }
  };

  const stats = [
    { icon: Package, label: "Total Lost", value: lostItems.length, color: "text-destructive" },
    { icon: Eye, label: "Total Found", value: foundItems.filter(f => f.status === "Found").length, color: "text-primary" },
    { icon: ClipboardCheck, label: "Pending Claims", value: claims.filter(c => c.claim_status === "pending").length, color: "text-accent" },
    { icon: CheckCircle, label: "Recovered", value: foundItems.filter(f => f.status === "Returned").length, color: "text-success" },
  ];

  const tabs = [
    { key: "overview", label: "Overview", icon: Shield },
    { key: "matching", label: "Match Items", icon: Search },
    { key: "lost", label: "Lost Items", icon: Package },
    { key: "found", label: "Found Items", icon: Eye },
    { key: "claims", label: "Student Claims", icon: ClipboardCheck },
    { key: "history", label: "History", icon: History },
  ] as const;

  return (
    <PageTransition className="min-h-screen pt-20 pb-10 relative overflow-hidden bg-slate-950/20">
      <div className="container px-4 relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0 border border-accent/20">
              <Shield className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground">Admin Panel</h1>
              <p className="text-muted-foreground text-xs sm:text-sm">Authority Control Center</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Link to="/report-found">
                <Button size="sm" className="w-full gap-2 bg-primary text-primary-foreground h-10 rounded-xl">
                  <Plus className="w-4 h-4" /> Report Found
                </Button>
            </Link>
          </div>
        </motion.div>

        {/* Animated Stats Section */}
        <div className="relative mb-12">
          {/* Background Graphics */}
          <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none opacity-20">
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-blob" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-blob animation-delay-2000" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((s, i) => (
              <motion.div 
                key={s.label} 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }} 
                whileHover={{ y: -8 }} 
                className={`relative group glass rounded-2xl p-6 border border-white/5 transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 ${s.label === "Pending Claims" && s.value > 0 ? "ring-2 ring-accent/50 animate-pulse" : ""}`}
                style={s.label === "Pending Claims" && s.value > 0 ? { animationDuration: "3s" } : {}}
              >
                <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
                   <s.icon className="w-16 h-16" />
                </div>
                <div className="relative z-10">
                  <div className={`w-10 h-10 rounded-lg ${s.color.replace('text-', 'bg-')}/10 flex items-center justify-center mb-4 ring-1 ring-white/10`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <div className="text-3xl font-display font-black text-foreground">
                    <NumberTicker value={s.value} />
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mt-1 opacity-70">
                    {s.label}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-4 no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`group relative px-6 py-2.5 rounded-xl transition-all duration-300 whitespace-nowrap flex items-center gap-2 ${
                tab === t.key ? "text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {tab === t.key && (
                <motion.div layoutId="activeTab" className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20" transition={{ type: "spring", duration: 0.6 }} />
              )}
              <t.icon className={`relative z-10 w-4 h-4 ${tab === t.key ? "scale-110" : ""}`} />
              <span className="relative z-10 text-sm tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <div className="relative w-12 h-12">
                   <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
                   <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="text-sm font-medium text-muted-foreground animate-pulse">Syncing...</div>
              </div>
            ) : (
              <>
                {tab === "overview" && (
                  <div className="space-y-6">
                    <div className="glass rounded-xl p-6 border border-white/5 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent animate-shimmer" />
                      <h3 className="font-display font-semibold text-lg mb-4 text-foreground flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" /> Active Feed
                      </h3>
                      <div className="space-y-3">
                        {[...lostItems.slice(0, 3), ...foundItems.slice(0, 2)].map((item, i) => (
                          <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-white/5">
                            <div className="flex items-center gap-3 text-sm">
                              <div className={`w-2 h-2 rounded-full ${"lost_id" in item ? "bg-destructive animate-pulse" : "bg-primary animate-pulse"}`} />
                              <span>{item.name || "Item reported"}</span>
                            </div>
                            <Badge className={statusColors[item.status || ""]}>{item.status}</Badge>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {tab === "matching" && (
                  <div className="space-y-4">
                    <div className="glass rounded-xl p-6 mb-4 border border-white/5 relative overflow-hidden">
                      {matchingLoading && <ScanLine />}
                      <h3 className="font-display font-semibold text-lg mb-2 text-foreground flex items-center gap-2">
                        <Search className="w-4 h-4 text-primary" /> AI Match Engine
                      </h3>
                      <p className="text-sm text-muted-foreground">Select a found item to start matching</p>
                      {selectedFoundItem && (
                        <Button size="sm" variant="outline" className="mt-3 rounded-xl" onClick={() => { setSelectedFoundItem(null); setMatchingLostItems([]); }}>
                          ← Clear Analysis
                        </Button>
                      )}
                    </div>

                    {!selectedFoundItem ? (
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {foundItems.filter(f => f.status === "Found").map((item, i) => (
                          <motion.div key={item.found_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} whileHover={{ scale: 1.02 }} className="group glass rounded-2xl overflow-hidden cursor-pointer border border-white/5" onClick={() => computeMatchesForFoundItem(item)}>
                             <div className="w-full h-32 bg-secondary/30 relative">
                               {item.image_path ? <img src={item.image_path} alt="" className="w-full h-full object-cover" /> : <Eye className="w-8 h-8 opacity-10 absolute center" />}
                             </div>
                             <div className="p-4">
                               <div className="font-bold text-foreground text-sm truncate">{item.name || item.description}</div>
                               <div className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">{item.location}</div>
                             </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="glass rounded-2xl p-6 border-2 border-primary/20 bg-primary/5">
                           <div className="flex gap-4">
                             {selectedFoundItem.image_path ? <img src={selectedFoundItem.image_path} className="w-24 h-24 rounded-xl object-cover" alt="" /> : <div className="w-24 h-24 bg-secondary" />}
                             <div>
                               <div className="text-xs font-black text-primary uppercase">Subject Item</div>
                               <div className="text-xl font-bold">{selectedFoundItem.name}</div>
                               <div className="text-sm text-muted-foreground">{selectedFoundItem.category} • {selectedFoundItem.location}</div>
                             </div>
                           </div>
                        </div>

                        {matchingLostItems.filter(m => m.similarity >= 0.45).map((match, i) => {
                           const pct = Math.round(match.similarity * 100);
                           return (
                             <motion.div key={match.lostItem.lost_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="glass rounded-2xl p-5 border border-white/5 relative group cursor-pointer hover:border-primary/50 transition-all" onClick={() => {
                               if (match.lostItem.user_id) {
                                 setMessageTarget({ userId: match.lostItem.user_id, name: match.lostItem.reporter_name || "Student", context: `Match: ${pct}%` });
                                 setMatchMessage(`Verification: We found your lost ${match.lostItem.name} with ${pct}% similarity. Visit Cell.`);
                                 setMessageDialogOpen(true);
                               }
                             }}>
                               <div className="flex justify-between items-center">
                                 <div className="flex gap-4">
                                   <div className="w-20 h-20 bg-secondary rounded-xl overflow-hidden">
                                     {match.lostItem.image_path && <img src={match.lostItem.image_path} className="w-full h-full object-cover" alt="" />}
                                   </div>
                                   <div>
                                     <div className="text-xl font-black text-foreground">{pct}% Match</div>
                                     <div className="text-sm font-medium">{match.lostItem.name}</div>
                                     <div className="flex flex-wrap gap-1 mt-2">
                                       {match.reasons.map(r => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
                                     </div>
                                   </div>
                                 </div>
                                 <Send className="w-5 h-5 opacity-20 group-hover:opacity-100 transition-opacity" />
                               </div>
                             </motion.div>
                           );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {tab === "lost" && (
                  <div className="grid gap-3">
                    {lostItems.map((item, i) => (
                      <motion.div key={item.lost_id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }} className="glass rounded-xl p-4 border border-white/5 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-foreground">{item.name || item.description}</div>
                          <div className="text-xs text-muted-foreground">{item.category} • {item.location} • {item.date_lost}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={statusColors[item.status || ""]}>{item.status}</Badge>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteLostItem(item.lost_id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {tab === "found" && (
                  <div className="grid gap-3">
                    {foundItems.filter(i => i.status !== "Returned").map((item, i) => (
                      <motion.div key={item.found_id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }} className="glass rounded-xl p-4 border border-white/5 flex items-center justify-between">
                         <div>
                          <div className="font-bold text-foreground">{item.name || item.description}</div>
                          <div className="text-xs text-muted-foreground">{item.category} • {item.location} • {item.date_found}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground/40 hover:text-success hover:bg-success/10"
                            onClick={() => handleMarkAsRecovered(item.found_id)}
                            title="Mark as Recovered"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Badge className={statusColors[item.status || ""]}>{item.status}</Badge>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogTitle>Permanent Deletion</AlertDialogTitle>
                              <AlertDialogDescription>Are you sure you want to remove this found item record from the database? This cannot be undone.</AlertDialogDescription>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive" onClick={() => handleDeleteFoundItem(item.found_id)}>Delete Permanently</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {tab === "claims" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    {claims.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground font-medium">No claims submitted yet.</div>
                    ) : (
                      claims.map((claim, i) => {
                        const claimFoundItem = foundItems.find(f => f.found_id === claim.item_id);
                        let bestMatch: MatchResult | null = null;
                        
                        if (claimFoundItem && claim.user_id && claim.verification_details) {
                            bestMatch = calculateMatch({ description: claim.verification_details } as any, claimFoundItem);
                        }

                        const isExpanded = expandedClaimId === claim.claim_id;

                        return (
                          <motion.div 
                            key={claim.claim_id} 
                            layout
                            initial={{ opacity: 0, y: 10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            transition={{ delay: i * 0.05 }} 
                            className={`glass rounded-xl border border-white/5 overflow-hidden transition-all duration-300 ${isExpanded ? "ring-2 ring-primary/20 shadow-2xl" : "hover:bg-white/5 cursor-pointer"}`}
                            onClick={() => !isExpanded && setExpandedClaimId(claim.claim_id)}
                          >
                            {/* Summary Header */}
                            <div className="p-5">
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex-shrink-0">
                                      {claim.claimer_avatar ? (
                                      <img src={claim.claimer_avatar} alt="Student" className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20" />
                                      ) : (
                                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                                          <User className="w-6 h-6 text-primary" />
                                      </div>
                                      )}
                                  </div>
                                  <div>
                                      <span className="font-bold text-foreground text-lg block leading-tight">{claim.claimer_name}</span>
                                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-tight font-black mt-0.5">
                                        {claim.claimer_pid && <span className="bg-secondary/50 px-1.5 py-0.5 rounded">PID: {claim.claimer_pid}</span>}
                                        {claim.claimer_email && <span className="text-primary/70">{claim.claimer_email}</span>}
                                      </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge className={`${statusColors[claim.claim_status || ""]} font-black px-4 py-1 rounded-full text-[10px] uppercase tracking-widest`}>
                                    {claim.claim_status}
                                  </Badge>
                                  {isExpanded && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={(e) => { e.stopPropagation(); setExpandedClaimId(null); }}>
                                      <X className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-4">
                                 <div>
                                      <div className="text-[10px] font-black text-primary/80 uppercase tracking-widest mb-1">Claimed Item</div>
                                      <div className="text-base font-bold text-foreground">{claim.item_name}</div>
                                 </div>
                                 {bestMatch && !isExpanded && (
                                   <div className="flex items-center gap-4">
                                     <div className="text-right">
                                       <div className="text-[10px] text-muted-foreground uppercase font-black">Score</div>
                                       <div className="font-black text-sm text-primary">{Math.round(bestMatch.similarity * 100)}%</div>
                                     </div>
                                     <Progress value={bestMatch.similarity * 100} className="w-20 h-1.5" />
                                   </div>
                                 )}
                              </div>
                            </div>

                            {/* Expandable Comparison Panel */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }} 
                                  animate={{ height: "auto", opacity: 1 }} 
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden border-t border-white/5 bg-black/20"
                                >
                                  <div className="p-6 space-y-8 text-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                      {/* Student Panel */}
                                      <div className="space-y-4">
                                        <div className="text-[10px] font-black text-primary uppercase tracking-widest px-1">Student Provided Details</div>
                                        <div className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-4">
                                          {(() => {
                                            const lostF = parseDescriptionFields(claim.verification_details);
                                            const foundF = parseDescriptionFields(claimFoundItem?.description || "");
                                            const compareFields = [
                                              { label: "Category", lostKey: "category", foundVal: claimFoundItem?.category },
                                              { label: "Location", lostKey: "lost location", foundVal: claimFoundItem?.location },
                                              { label: "Date", lostKey: "date lost", foundVal: claimFoundItem?.date_found },
                                              { label: "Color", lostKey: "color", foundVal: foundF["color"] },
                                              { label: "Brand", lostKey: "brand", foundVal: foundF["brand"] },
                                            ];

                                            return (
                                              <div className="space-y-4">
                                                {compareFields.map(f => {
                                                  const val = lostF[f.lostKey] || lostF[f.label.toLowerCase()] || "Not provided";
                                                  const isMatch = val !== "Not provided" && f.foundVal && val.toLowerCase().includes(f.foundVal.toLowerCase());
                                                  return (
                                                    <div key={f.label}>
                                                      <div className="flex items-center justify-between mb-1">
                                                         <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">{f.label}</span>
                                                         {isMatch && <CheckCircle className="w-3 h-3 text-success" />}
                                                      </div>
                                                      <div className={`text-sm font-semibold py-2 px-3 rounded-lg border ${isMatch ? "bg-success/5 border-success/30 text-success" : "bg-white/5 border-white/5 text-foreground/80"}`}>
                                                        {val}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                                <div className="pt-4 border-t border-white/5">
                                                  <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest block mb-2">Original Text Claim</span>
                                                  <p className="text-xs text-foreground/70 italic leading-relaxed">"{lostF["_text"] || claim.verification_details || "No additional text provided"}"</p>
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </div>

                                      {/* Found Item Panel */}
                                      <div className="space-y-4">
                                        <div className="text-[10px] font-black text-accent uppercase tracking-widest px-1">Found Item Record</div>
                                        <div className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-4">
                                          {claimFoundItem && (() => {
                                            const foundF = parseDescriptionFields(claimFoundItem.description);
                                            const fields = [
                                              { label: "Category", val: claimFoundItem.category },
                                              { label: "Location", val: claimFoundItem.location },
                                              { label: "Date", val: claimFoundItem.date_found },
                                              { label: "Color", val: foundF["color"] },
                                              { label: "Brand", val: foundF["brand"] },
                                            ];
                                            return (
                                              <div className="space-y-4">
                                                {fields.map(f => (
                                                  <div key={f.label}>
                                                    <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest block mb-1">{f.label}</span>
                                                    <div className="text-sm font-bold text-foreground py-2 px-3 rounded-lg bg-white/5 border border-white/5">
                                                      {f.val || "N/A"}
                                                    </div>
                                                  </div>
                                                ))}
                                                <div className="pt-4 border-t border-white/5">
                                                  <span className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest block mb-2">Internal Staff Notes</span>
                                                  <p className="text-xs text-foreground/70 leading-relaxed">{foundF["_text"] || claimFoundItem.description || "No description provided."}</p>
                                                </div>
                                                {claimFoundItem.image_path && (
                                                   <div className="pt-4 rounded-xl overflow-hidden border border-white/5">
                                                      <img src={claimFoundItem.image_path} className="w-full h-32 object-cover opacity-80" />
                                                   </div>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-white/10">
                                       <div className="flex gap-3 w-full sm:w-auto">
                                          {claim.claim_status === "pending" && (
                                            <>
                                              <Button className="flex-1 sm:flex-none bg-success text-white px-8 font-black rounded-xl h-11" onClick={(e) => { e.stopPropagation(); handleUpdateClaimStatus(claim.claim_id, "approved"); }}>Approve</Button>
                                              <Button className="flex-1 sm:flex-none bg-destructive/10 text-destructive border border-destructive/20 px-8 font-black rounded-xl h-11" onClick={(e) => { e.stopPropagation(); handleUpdateClaimStatus(claim.claim_id, "rejected"); }}>Reject</Button>
                                            </>
                                          )}
                                          <Button variant="outline" className="flex-1 sm:flex-none px-8 font-black rounded-xl h-11" onClick={(e) => { e.stopPropagation(); if (claim.user_id) { setClaimMessageTarget({userId: claim.user_id, name: claim.claimer_name || "Student"}); setClaimMessageDialogOpen(true); } }}>Message</Button>
                                       </div>
                                       {bestMatch && (
                                          <div className="flex items-center gap-3">
                                            <div className="text-right">
                                              <div className="text-[10px] font-black text-muted-foreground uppercase opacity-50">Match Score</div>
                                              <div className="text-xl font-black text-primary">{Math.round(bestMatch.similarity * 100)}%</div>
                                            </div>
                                            <Zap className="w-5 h-5 text-primary animate-pulse" />
                                          </div>
                                       )}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })
                    )}
                  </motion.div>
                )}

                {tab === "history" && (
                   <div className="space-y-3">
                      <div className="glass rounded-xl p-6 mb-4">
                        <h3 className="font-display font-semibold text-lg mb-2 text-foreground">Recovery History</h3>
                        <p className="text-sm text-muted-foreground">List of items successfully returned to students.</p>
                      </div>
                      {foundItems.filter(i => i.status === "Returned").length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground font-medium">No returned items in history.</div>
                      ) : (
                        foundItems.filter(i => i.status === "Returned").map((item, i) => (
                          <motion.div 
                            key={item.found_id}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className="glass rounded-xl p-4 flex items-center justify-between border border-white/5 bg-success/5"
                          >
                             <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center border border-success/20">
                                  <CheckCircle className="w-5 h-5 text-success" />
                                </div>
                                <div className="max-w-[150px] sm:max-w-xs">
                                   <div className="font-bold text-foreground text-sm truncate">{item.name || item.description}</div>
                                   <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{item.location} • {item.date_found}</div>
                                </div>
                             </div>
                             <div className="flex items-center gap-3">
                               <Badge className="bg-success text-white font-black px-3 py-1 rounded-full text-[10px] uppercase">Returned</Badge>
                               <Button 
                                 variant="outline" 
                                 size="sm" 
                                 className="h-8 gap-2 text-[10px] font-black uppercase rounded-xl border-white/10 hover:bg-white/5"
                                 onClick={async () => {
                                   await supabase.from("Found_Item").update({ status: "Found" }).eq("found_id", item.found_id).then(() => {
                                      toast.success("Recovery undone");
                                      fetchData();
                                   });
                                 }}
                               >
                                 <Undo2 className="w-3.5 h-3.5" /> Undo
                               </Button>
                             </div>
                          </motion.div>
                        ))
                      )}
                   </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="glass"><DialogHeader><DialogTitle>Message {messageTarget?.name}</DialogTitle><DialogDescription>{messageTarget?.context}</DialogDescription></DialogHeader>
          <Textarea value={matchMessage} onChange={e => setMatchMessage(e.target.value)} className="min-h-[120px]" />
          <Button className="w-full" onClick={async () => {
             if (!messageTarget || !matchMessage) return;
             await supabase.from("notifications").insert({ user_id: messageTarget.userId, message: matchMessage, status: "unread", type: "admin_message", sender_id: currentUser?.id });
             toast.success("Sent"); setMessageDialogOpen(false);
          }}><Send className="w-4 h-4 mr-2" />Send Message</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={claimMessageDialogOpen} onOpenChange={setClaimMessageDialogOpen}>
        <DialogContent className="glass"><DialogHeader><DialogTitle>Message {claimMessageTarget?.name}</DialogTitle></DialogHeader>
          <Textarea value={claimMessage} onChange={e => setClaimMessage(e.target.value)} className="min-h-[120px]" />
          <Button className="w-full" onClick={async () => {
             if (!claimMessageTarget || !claimMessage) return;
             await supabase.from("notifications").insert({ user_id: claimMessageTarget.userId, message: claimMessage, status: "unread", type: "admin_message", sender_id: currentUser?.id });
             toast.success("Sent"); setClaimMessageDialogOpen(false);
          }}><Send className="w-4 h-4 mr-2" />Send Message</Button>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
};

export default AdminDashboard;
