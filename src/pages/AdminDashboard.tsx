import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, Package, Eye, ClipboardCheck, Bell, Users, Plus, CheckCircle, XCircle, Search, Percent, User, Send, History, Trash2, Undo2 } from "lucide-react";
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

// Helper function to send email notification
const sendEmailNotification = async (userId: string, message: string, type: string, itemName?: string) => {
  try {
    await supabase.functions.invoke("send-notification-email", {
      body: { userId, message, type, itemName },
    });
  } catch (error) {
    console.error("Failed to send email notification:", error);
    // Don't show error to user - email is optional enhancement
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

/** Parse structured description fields like "Color: Black | Brand: Nike" */
function parseDescriptionFields(desc: string | null): Record<string, string> {
  if (!desc) return {};
  const fields: Record<string, string> = {};
  const parts = desc.split(" | ");
  for (const part of parts) {
    const colonIdx = part.indexOf(": ");
    if (colonIdx > 0) {
      const key = part.substring(0, colonIdx).toLowerCase().trim();
      fields[key] = part.substring(colonIdx + 2).trim().toLowerCase();
    }
  }
  // The first part (before any "|") is the free text description
  if (parts.length > 0 && !parts[0].includes(": ")) {
    fields["_text"] = parts[0].toLowerCase().trim();
  }
  return fields;
}

function calculateMatch(lost: LostItem, found: FoundItem): MatchResult {
  let score = 0;
  let total = 0;
  const reasons: string[] = [];

  // Category match (30 pts) - HIGH PRIORITY
  total += 30;
  if (lost.category && found.category && lost.category.toLowerCase() === found.category.toLowerCase()) {
    score += 30;
    reasons.push("Category match");
  }

  // Subcategory match (25 pts) - HIGH PRIORITY
  total += 25;
  if (lost.subcategory && found.subcategory && lost.subcategory.toLowerCase() === found.subcategory.toLowerCase()) {
    score += 25;
    reasons.push("Subcategory match");
  }

  // Location match (25 pts) - HIGH PRIORITY
  total += 25;
  if (lost.location && found.location) {
    const ll = lost.location.toLowerCase();
    const fl = found.location.toLowerCase();
    if (ll === fl) {
      score += 25;
      reasons.push("Location identical");
    } else if (ll.includes(fl) || fl.includes(ll)) {
      score += 18;
      reasons.push("Related location");
    }
  }

  // Structured field matching: color, brand, size, distinguishing marks (10 pts)
  const lostFields = parseDescriptionFields(lost.description);
  const foundFields = parseDescriptionFields(found.description);

  // Color (3 pts)
  total += 3;
  if (lostFields["color"] && foundFields["color"] && lostFields["color"] === foundFields["color"]) {
    score += 3;
    reasons.push("Color match");
  }

  // Brand (4 pts)
  total += 4;
  if (lostFields["brand"] && foundFields["brand"]) {
    if (lostFields["brand"] === foundFields["brand"]) {
      score += 4;
      reasons.push("Brand identity");
    } else if (lostFields["brand"].includes(foundFields["brand"]) || foundFields["brand"].includes(lostFields["brand"])) {
      score += 2;
      reasons.push("Possible brand match");
    }
  }

  // Distinguishing marks (3 pts)
  total += 3;
  if (lostFields["distinguishing marks"] && foundFields["distinguishing marks"]) {
    const lWords = new Set(lostFields["distinguishing marks"].split(/\s+/).filter(w => w.length > 2));
    const fWords = new Set(foundFields["distinguishing marks"].split(/\s+/).filter(w => w.length > 2));
    const overlap = [...lWords].filter(w => fWords.has(w));
    if (overlap.length > 0) {
      score += Math.min(3, Math.round((overlap.length / Math.max(lWords.size, fWords.size)) * 3));
      reasons.push("Distinctive marks");
    }
  }

  // Free text description similarity (5 pts) - LOW PRIORITY (as text varies)
  const lostText = (lostFields["_text"] || lost.description || "").toLowerCase();
  const foundText = (foundFields["_text"] || found.description || "").toLowerCase();
  total += 5;
  if (lostText && foundText) {
    const lostWords = new Set(lostText.split(/\s+/).filter(w => w.length > 2));
    const foundWords = new Set(foundText.split(/\s+/).filter(w => w.length > 2));
    const intersection = [...lostWords].filter(w => foundWords.has(w));
    const union = new Set([...lostWords, ...foundWords]);
    if (union.size > 0) {
      const sim = intersection.length / union.size;
      const descScore = Math.round(sim * 5);
      score += descScore;
      if (descScore >= 3) reasons.push("Descriptive similarity");
    }
  }

  // Date proximity (5 pts)
  total += 5;
  if (lost.date_lost && found.date_found) {
    const diffDays = Math.abs(new Date(found.date_found).getTime() - new Date(lost.date_lost).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 1) { score += 5; reasons.push("Same day"); }
    else if (diffDays <= 3) { score += 3; reasons.push("Close date"); }
    else if (diffDays <= 7) { score += 1; reasons.push("Recent report"); }
  }

  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
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

    // STEP 1: Try photo/embedding comparison first (Primary Image Match)
    const isValidDateMatch = (lostDateStr: string | null, foundDateStr: string | null) => {
      if (!lostDateStr || !foundDateStr) return true;
      const lostDate = new Date(lostDateStr);
      const foundDate = new Date(foundDateStr);
      lostDate.setUTCHours(0, 0, 0, 0);
      foundDate.setUTCHours(0, 0, 0, 0);
      const diffTime = lostDate.getTime() - foundDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      // Valid if lost before found (<= -1), same day (0), or one day after (1)
      return diffDays <= 1;
    };

    if (foundItem.found_embedding) {
      const { data: embeddingMatches } = await supabase.rpc("match_found_to_lost", {
        _embedding: foundItem.found_embedding,
        _subcategory: foundItem.subcategory || foundItem.category || "",
        _limit: 10,
      });

      if (embeddingMatches && embeddingMatches.length > 0) {
        for (const m of embeddingMatches) {
          const matchAny = m as any;
          if (!isValidDateMatch(matchAny.date_lost, foundItem.date_found)) continue;

          if (m.similarity >= 0.80) { // Keep > 80%
            hasGoodPhotoMatch = true;
            const lostItem = lostItems.find(l => l.lost_id === matchAny.lost_id) || {
              lost_id: matchAny.lost_id,
              name: m.name,
              category: m.category,
              subcategory: matchAny.subcategory,
              status: matchAny.status,
              location: matchAny.location,
              date_lost: matchAny.date_lost,
              description: matchAny.description,
              image_path: matchAny.image_path,
              user_id: matchAny.user_id,
              lost_embedding: null,
              text_embedding: null,
              ai_description: null,
              reporter_name: null,
            };
            results.push({
              lostItem: lostItem as LostItem,
              similarity: m.similarity,
              reasons: ["Visual match"],
              matchType: "photo",
            });
          }
        }
      }
    }

    // STEP 2: Try LLM Text matching first (Primary Text Match) using text_embedding
    if (!hasGoodPhotoMatch && foundItem.text_embedding) {
       const { data: textMatches } = await supabase.rpc("match_found_to_lost_text", {
         _embedding: foundItem.text_embedding,
         _subcategory: foundItem.subcategory || foundItem.category || "",
         _limit: 10,
       });

       if (textMatches && textMatches.length > 0) {
         for (const m of textMatches) {
           const matchAny = m as any;
           if (!isValidDateMatch(matchAny.date_lost, foundItem.date_found)) continue;

           if (m.similarity >= 0.40) { // Keep > 40% matching descriptions
             hasGoodTextAiMatch = true;
             // Don't duplicate matches
             if (results.find(r => r.lostItem.lost_id === matchAny.lost_id)) continue;
             
             const lostItem = lostItems.find(l => l.lost_id === matchAny.lost_id) || {
               lost_id: matchAny.lost_id,
               name: matchAny.name,
               category: matchAny.category, // etc
               subcategory: matchAny.subcategory,
               status: matchAny.status,
               location: matchAny.location,
               date_lost: matchAny.date_lost,
               description: matchAny.description,
               image_path: matchAny.image_path,
               user_id: matchAny.user_id,
             };
             
             results.push({
               lostItem: lostItem as LostItem,
               similarity: m.similarity,
               reasons: ["AI Text match"],
               matchType: "text",
             });
           }
         }
       }
    }

    // STEP 3: Only fall back to local rule-based text matching if no good photo AND no good AI text matches
    if (!hasGoodPhotoMatch && !hasGoodTextAiMatch) {
      for (const lost of lostItems) {
        if (lost.status !== "Lost") continue;
        if (!isValidDateMatch(lost.date_lost, foundItem.date_found)) continue;
        if (results.find(r => r.lostItem.lost_id === lost.lost_id)) continue;
        const match = calculateMatch(lost, foundItem);
        if (match.similarity >= 0.40) {
          results.push({...match, matchType: "text"});
        }
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    setMatchingLostItems(results);
    setMatchingLoading(false);
  };

  const handleUpdateClaimStatus = async (claimId: number, status: string) => {
    const claim = claims.find(c => c.claim_id === claimId);
    const { error } = await supabase.from("Claim").update({ claim_status: status }).eq("claim_id", claimId);
    if (error) {
      toast.error("Failed to update claim status");
    } else {
      if (claim?.user_id) {
        let message = "";
        if (status === "approved") {
          message = `✅ Your claim for "${claim.item_name || "an item"}" has been approved! Please visit the Lost and Found Cell to collect your item.`;
        } else if (status === "rejected") {
          message = `❌ Your claim for "${claim.item_name || "an item"}" has been rejected. For further interrogation, please meet at the Lost and Found Cell.`;
        }
        if (message) {
          await supabase.from("notifications").insert({
            user_id: claim.user_id,
            message,
            status: "unread",
            type: "claim_update",
            sender_id: currentUser?.id || null,
          });
          // Send email notification
          sendEmailNotification(claim.user_id, message, "claim_update", claim.item_name || undefined);
        }
      }
      toast.success(`Claim ${status}!`);
      fetchData();
    }
  };

  const handleDeleteLostItem = async (lostId: number) => {
    const { error } = await supabase.from("Lost_Item").delete().eq("lost_id", lostId);
    if (error) {
      toast.error("Failed to delete lost item");
    } else {
      toast.success("Lost item deleted successfully");
      fetchData();
    }
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
    <PageTransition className="min-h-screen pt-20 pb-10">
      <div className="container px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground whitespace-nowrap">Admin Panel</h1>
              <p className="text-muted-foreground text-xs sm:text-sm">Manage items, claims, and users</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Link to="/report-found" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button size="sm" className="w-full gap-2 bg-primary text-primary-foreground h-10 rounded-xl">
                  <Plus className="w-4 h-4" /> Report Found
                </Button>
              </motion.div>
            </Link>
            <Link to="/items" className="w-full sm:w-auto">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button size="sm" variant="outline" className="w-full gap-2 h-10 rounded-xl border-border/40">
                  <Search className="w-4 h-4" /> Browse Items
                </Button>
              </motion.div>
            </Link>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} whileHover={{ y: -4, scale: 1.02 }} className="glass rounded-xl p-5">
              <s.icon className={`w-6 h-6 ${s.color} mb-3`} />
              <div className="text-2xl font-display font-bold text-foreground">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-2">
          {tabs.map((t) => (
            <Button key={t.key} variant={tab === t.key ? "default" : "ghost"} size="sm" onClick={() => setTab(t.key)} className={`gap-2 whitespace-nowrap ${tab === t.key ? "bg-primary text-primary-foreground" : ""}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : (
          <>
            {/* Overview */}
            {tab === "overview" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="glass rounded-xl p-6">
                  <h3 className="font-display font-semibold text-lg mb-4 text-foreground">Recent Activity</h3>
                  <div className="space-y-3">
                    {[...lostItems.slice(0, 3), ...foundItems.slice(0, 2)].map((item, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${"lost_id" in item ? "bg-destructive" : "bg-primary"}`} />
                          <span className="text-sm text-foreground">{item.name || item.description || "No description"}</span>
                        </div>
                        <Badge className={statusColors[item.status || ""] || ""}>{item.status}</Badge>
                      </motion.div>
                    ))}
                    {lostItems.length === 0 && foundItems.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-4">No items reported yet</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Matching */}
            {tab === "matching" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="glass rounded-xl p-6 mb-4">
                  <h3 className="font-display font-semibold text-lg mb-2 text-foreground">Item Matching</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedFoundItem 
                      ? `Showing lost items matching "${selectedFoundItem.name || selectedFoundItem.category}"`
                      : "Click on a found item to see matching lost items from students"}
                  </p>
                  {selectedFoundItem && (
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => { setSelectedFoundItem(null); setMatchingLostItems([]); }}>
                      ← Back to Found Items
                    </Button>
                  )}
                </div>

                {!selectedFoundItem ? (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {foundItems.filter(f => f.status === "Found").map((item, i) => (
                      <motion.div
                        key={item.found_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        whileHover={{ y: -4, scale: 1.02 }}
                        className="glass rounded-xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/30"
                        onClick={() => computeMatchesForFoundItem(item)}
                      >
                         <div className="w-full h-24 bg-secondary flex items-center justify-center overflow-hidden">
                           {item.image_path ? (
                             <img src={item.image_path} alt={item.name || "Found item"} className="w-full h-full object-cover" />
                           ) : (
                             <Eye className="w-8 h-8 text-muted-foreground/30" />
                           )}
                         </div>
                        <div className="p-4">
                          <div className="font-medium text-foreground text-sm">{item.name || item.description || "Unknown Item"}</div>
                          <div className="text-xs text-muted-foreground mt-1">{item.category} • {item.location}</div>
                          <div className="text-xs text-muted-foreground mt-1">{item.date_found}</div>
                        </div>
                      </motion.div>
                    ))}
                    {foundItems.filter(f => f.status === "Found").length === 0 && (
                      <div className="col-span-full text-center py-12 text-muted-foreground">No found items available for matching</div>
                    )}
                  </div>
                ) : matchingLoading ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="w-8 h-8 mx-auto mb-3 animate-pulse text-primary" />
                    Finding matching lost items...
                  </div>
                ) : (
                  <div className="space-y-4">
                     {/* Selected found item detail card */}
                     <div className="glass rounded-xl p-5 border-2 border-primary/30">
                       <div className="text-xs font-medium text-primary mb-3">SELECTED FOUND ITEM</div>
                       <div className="flex gap-4">
                         {selectedFoundItem.image_path ? (
                           <img src={selectedFoundItem.image_path} alt="" className="w-24 h-24 rounded-xl object-cover flex-shrink-0" />
                         ) : (
                           <div className="w-24 h-24 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                             <Package className="w-8 h-8 text-muted-foreground/30" />
                           </div>
                         )}
                         <div>
                           <div className="font-semibold text-foreground text-lg">{selectedFoundItem.name || selectedFoundItem.description}</div>
                           <div className="text-sm text-muted-foreground mt-1">📍 {selectedFoundItem.location || "Unknown"}</div>
                           <div className="text-sm text-muted-foreground">📅 {selectedFoundItem.date_found || "Unknown"}</div>
                           <div className="text-sm text-muted-foreground">🏷️ {selectedFoundItem.category}{selectedFoundItem.subcategory ? ` / ${selectedFoundItem.subcategory}` : ""}</div>
                           {selectedFoundItem.description && (
                             <div className="text-xs text-muted-foreground mt-2 bg-secondary/50 rounded-lg p-2">{selectedFoundItem.description}</div>
                           )}
                         </div>
                       </div>
                     </div>

                    {matchingLostItems.length === 0 ? (
                      <div className="text-center py-12 glass rounded-xl">
                        <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                        <p className="text-muted-foreground text-lg font-medium">No matching lost items found yet.</p>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-muted-foreground font-medium">Matching Lost Items ({matchingLostItems.length})</div>
                        {matchingLostItems.map((match, i) => {
                          const pct = Math.round(match.similarity * 100);
                          const matchBadge = pct > 85
                            ? { label: "Strong Match", cls: "bg-success/20 text-success" }
                            : pct >= 70
                              ? { label: "Possible Match", cls: "bg-accent/20 text-accent" }
                              : null;
                          return (
                            <motion.div
                              key={match.lostItem.lost_id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="glass rounded-xl p-5 cursor-pointer hover:ring-2 hover:ring-accent/30"
                              onClick={() => {
                                if (match.lostItem.user_id) {
                                  setMessageTarget({
                                    userId: match.lostItem.user_id,
                                    name: match.lostItem.reporter_name || "Student",
                                    context: `Match for "${selectedFoundItem.name || selectedFoundItem.category}" (${pct}%)`,
                                  });
                                  setMatchMessage(`We found your lost item "${match.lostItem.name || match.lostItem.description || match.lostItem.category}" with ${pct}% match! Please visit the Lost and Found Cell to verify and collect.`);
                                  setMessageDialogOpen(true);
                                } else {
                                  toast.error("No student linked to this lost item");
                                }
                              }}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className={pct >= 70 ? "bg-success/20 text-success" : pct >= 50 ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}>
                                    {pct}%
                                  </Badge>
                                  {matchBadge && <Badge className={matchBadge.cls}>{matchBadge.label}</Badge>}
                                   <Badge className={`text-xs ${match.matchType === "photo" ? "bg-blue-500/20 text-blue-400" : "bg-primary/20 text-primary"}`}>
                                     {match.matchType === "photo" ? "📷 Visual Match" : "📝 Text Match"}
                                   </Badge>
                                </div>
                                <Send className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <Progress value={pct} className="h-2 mb-4" />
                              <div className="flex gap-4">
                                {match.lostItem.image_path ? (
                                  <img src={match.lostItem.image_path} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                                ) : (
                                  <div className="w-20 h-20 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                                    <Package className="w-6 h-6 text-muted-foreground/30" />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="text-xs font-medium text-destructive mb-1">LOST ITEM</div>
                                  <div className="font-medium text-foreground">{match.lostItem.name || match.lostItem.description || "No description"}</div>
                                  <div className="text-sm text-muted-foreground mt-1">📍 {match.lostItem.location || "Unknown"} • 📅 {match.lostItem.date_lost || "Unknown"}</div>
                                  {match.reasons.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {match.reasons.map(r => <Badge key={r} variant="outline" className="text-xs">{r}</Badge>)}
                                    </div>
                                  )}
                                  {match.lostItem.reporter_name && (
                                    <div className="mt-2 space-y-1">
                                      <div className="flex items-center gap-1.5 text-xs text-foreground">
                                        <User className="w-3 h-3" /> Reported by: <span className="font-medium">{match.lostItem.reporter_name}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground pl-4">
                                        {match.lostItem.reporter_pid && <span>PID: {match.lostItem.reporter_pid}</span>}
                                        {match.lostItem.reporter_email && <span>{match.lostItem.reporter_email}</span>}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* Lost Items */}
            {tab === "lost" && (
              <div className="space-y-3">
                {lostItems.length === 0 ? (
                  <p className="text-center py-12 text-muted-foreground">No lost items reported yet</p>
                ) : lostItems.map((item, i) => (
                  <motion.div key={item.lost_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ x: 4 }} className="glass rounded-xl p-5 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{item.name || item.description || "No description"}</div>
                      <div className="text-sm text-muted-foreground">{item.category} • {item.location} • {item.date_lost}</div>
                      {item.reporter_name && (
                        <div className="mt-1 space-y-0.5">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <User className="w-3 h-3" /> Reported by: <span className="font-medium text-foreground">{item.reporter_name}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground pl-4">
                            {item.reporter_pid && <span>PID: {item.reporter_pid}</span>}
                            {item.reporter_email && <span>{item.reporter_email}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[item.status || ""] || ""}>{item.status}</Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Lost Item Report</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this lost item report for "{item.name || "this item"}"? This action cannot be undone and will permanently remove it from the database.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => handleDeleteLostItem(item.lost_id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Found Items */}
            {tab === "found" && (
              <div className="space-y-3">
                {foundItems.filter(i => i.status !== "Returned").length === 0 ? (
                  <p className="text-center py-12 text-muted-foreground">No active found items</p>
                ) : foundItems.filter(i => i.status !== "Returned").map((item, i) => (
                  <motion.div key={item.found_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ x: 4 }} className="glass rounded-xl p-5 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{item.name || item.description || "No description"}</div>
                      <div className="text-sm text-muted-foreground">{item.category} • {item.location} • {item.date_found}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColors[item.status || ""] || ""}>{item.status}</Badge>
                      {(item.status === "Matched" || item.status === "Found") && (
                        <Button
                          size="sm"
                          className="gap-1 bg-success/20 text-success hover:bg-success/30"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await supabase.from("Found_Item").update({ status: "Returned" }).eq("found_id", item.found_id);
                            const matchedLost = lostItems.filter(l =>
                              l.category?.toLowerCase() === item.category?.toLowerCase() &&
                              l.location?.toLowerCase() === item.location?.toLowerCase() &&
                              (l.status === "Matched" || l.status === "Lost")
                            );
                            for (const lost of matchedLost) {
                              await supabase.from("Lost_Item").update({ status: "Returned" }).eq("lost_id", lost.lost_id);
                              if (lost.user_id) {
                                await supabase.from("notifications").insert({
                                  user_id: lost.user_id,
                                  message: `✅ Your lost item "${lost.name || lost.description || lost.category}" has been recovered and returned!`,
                                  status: "unread",
                                  type: "recovered",
                                  sender_id: currentUser?.id || null,
                                });
                              }
                            }
                            toast.success("Item marked as recovered!");
                            fetchData();
                          }}
                        >
                          <CheckCircle className="w-3 h-3" /> Mark Recovered
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Found Item</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{item.name || item.description || "this item"}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={async () => {
                                const { error } = await supabase.from("Found_Item").delete().eq("found_id", item.found_id);
                                if (error) {
                                  toast.error("Failed to delete item");
                                } else {
                                  toast.success("Item deleted successfully");
                                  fetchData();
                                }
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* History */}
            {tab === "history" && (
              <div className="space-y-3">
                <div className="glass rounded-xl p-6 mb-4">
                  <h3 className="font-display font-semibold text-lg mb-2 text-foreground">Recovery History</h3>
                  <p className="text-sm text-muted-foreground">Items that have been recovered and returned to their owners.</p>
                </div>
                {foundItems.filter(i => i.status === "Returned").length === 0 ? (
                  <p className="text-center py-12 text-muted-foreground">No recovered items yet</p>
                ) : foundItems.filter(i => i.status === "Returned").map((item, i) => (
                  <motion.div key={item.found_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-success" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{item.name || item.description || "No description"}</div>
                        <div className="text-sm text-muted-foreground">{item.category} • {item.location} • {item.date_found}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-success/20 text-success">Recovered</Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-warning/10 hover:text-warning" title="Undo recovery">
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Undo Recovery</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will mark "{item.name || item.description || "this item"}" as Found again and notify the owner that the recovery was cancelled. Are you sure?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-warning text-warning-foreground hover:bg-warning/90"
                              onClick={async () => {
                                // Update found item status back to Found
                                await supabase.from("Found_Item").update({ status: "Found" }).eq("found_id", item.found_id);

                                // Find and update related lost items back to Lost status
                                const matchedLost = lostItems.filter(l =>
                                  l.category?.toLowerCase() === item.category?.toLowerCase() &&
                                  l.location?.toLowerCase() === item.location?.toLowerCase() &&
                                  l.status === "Returned"
                                );
                                for (const lost of matchedLost) {
                                  await supabase.from("Lost_Item").update({ status: "Lost" }).eq("lost_id", lost.lost_id);

                                  // Notify the owner about the cancellation
                                  if (lost.user_id) {
                                    await supabase.from("notifications").insert({
                                      user_id: lost.user_id,
                                      message: `⚠️ Recovery cancelled for "${lost.name || lost.description || lost.category}". The item is still in our possession.`,
                                      status: "unread",
                                      type: "info",
                                      sender_id: currentUser?.id || null,
                                    });
                                  }
                                }

                                // Delete the recovery notification
                                await supabase.from("notifications")
                                  .delete()
                                  .eq("type", "recovered")
                                  .ilike("message", `%${item.name || item.description || ""}%`);

                                toast.success("Recovery undone successfully!");
                                fetchData();
                              }}
                            >
                              Undo Recovery
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Student Claims */}
            {tab === "claims" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="glass rounded-xl p-6 mb-4">
                  <h3 className="font-display font-semibold text-lg mb-2 text-foreground">Student Claims</h3>
                  <p className="text-sm text-muted-foreground">Review and verify student claims for found items.</p>
                </div>
                {claims.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No claims submitted yet.</div>
                ) : (
                  claims.map((claim, i) => {
                    // Find the best match for this student's claim
                    const claimFoundItem = foundItems.find(f => f.found_id === claim.item_id);
                    let bestMatch: MatchResult | null = null;
                    
                    if (claimFoundItem && claim.user_id) {
                      const studentLostItems = lostItems.filter(l => l.user_id === claim.user_id);
                      for (const lost of studentLostItems) {
                        const match = calculateMatch(lost, claimFoundItem);
                        if (!bestMatch || match.similarity > bestMatch.similarity) {
                          bestMatch = match;
                        }
                      }
                    }

                    return (
                      <motion.div key={claim.claim_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl p-5 border border-border/40 overflow-hidden relative group">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            {claim.claimer_avatar ? (
                              <img src={claim.claimer_avatar} alt="Student" className="w-10 h-10 rounded-full object-cover border border-border" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-5 h-5 text-primary" />
                              </div>
                            )}
                            <div>
                                <span className="font-semibold text-foreground block">{claim.claimer_name}</span>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                                  {claim.claimer_pid && <span>PID: {claim.claimer_pid}</span>}
                                  {claim.claimer_pid && claim.claimer_email && <span>•</span>}
                                  {claim.claimer_email && <span>{claim.claimer_email}</span>}
                                </div>
                            </div>
                          </div>
                          <Badge className={`${statusColors[claim.claim_status || ""]} font-semibold px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide shadow-sm flex items-center gap-1.5`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${claim.claim_status === "pending" ? "bg-accent animate-pulse" : "bg-current"}`} />
                            {claim.claim_status}
                          </Badge>
                        </div>

                        <div className="mb-4">
                          <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                             <Package className="w-4 h-4 text-primary" />
                             Claimed Item: {claim.item_name}
                          </div>
                          
                          {claim.verification_details && (() => {
                            const parts = claim.verification_details.split(" | ");
                            const photoPart = parts.find(p => p.startsWith("Photo: "));
                            const textParts = parts.filter(p => !p.startsWith("Photo: ")).join(" | ");
                            return (
                              <div className="bg-secondary/30 rounded-xl p-3 border border-border/20 mb-3">
                                <div className="text-xs text-foreground leading-relaxed">
                                  <strong className="text-primary/80 uppercase text-[9px] block mb-1">Student Description:</strong>
                                  {textParts || "No text details provided"}
                                </div>
                                {photoPart && (
                                  <div className="mt-3">
                                    <img src={photoPart.replace("Photo: ", "")} alt="Claim photo" className="max-h-48 w-full rounded-lg object-contain bg-background/50 border border-border/30 shadow-sm" />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-6 pt-4 border-t border-border/20">
                          <div className="space-y-3 flex-1">
                            <div className="flex gap-2 flex-wrap">
                              {claim.claim_status === "pending" && (
                                <>
                                  <Button size="sm" className="gap-1.5 bg-success/20 text-success hover:bg-success/30 h-8 font-semibold rounded-lg" onClick={() => handleUpdateClaimStatus(claim.claim_id, "approved")}>
                                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                                  </Button>
                                  <Button size="sm" className="gap-1.5 bg-destructive/20 text-destructive hover:bg-destructive/30 h-8 font-semibold rounded-lg" onClick={() => handleUpdateClaimStatus(claim.claim_id, "rejected")}>
                                    <XCircle className="w-3.5 h-3.5" /> Reject
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 h-8 font-semibold rounded-lg border-border/40"
                                onClick={() => {
                                  if (claim.user_id) {
                                    setClaimMessageTarget({ userId: claim.user_id, name: claim.claimer_name || "Student" });
                                    setClaimMessage("");
                                    setClaimMessageDialogOpen(true);
                                  }
                                }}
                              >
                                <Send className="w-3.5 h-3.5" /> Message
                              </Button>
                            </div>
                            
                            {bestMatch && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                                    <Percent className="w-3.5 h-3.5" /> Automated Match Confidence
                                  </span>
                                  <span className={`font-bold ${bestMatch.similarity >= 0.8 ? "text-success" : bestMatch.similarity >= 0.6 ? "text-accent" : "text-muted-foreground"}`}>
                                    {Math.round(bestMatch.similarity * 100)}% Match
                                  </span>
                                </div>
                                <Progress value={bestMatch.similarity * 100} className={`h-1.5 rounded-full ${bestMatch.similarity >= 0.8 ? "[&>div]:bg-success" : bestMatch.similarity >= 0.6 ? "[&>div]:bg-accent" : ""}`} />
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {bestMatch.reasons.map(r => (
                                    <Badge key={r} variant="ghost" className="bg-secondary/50 text-muted-foreground text-[9px] px-1.5 py-0 h-4 uppercase tracking-tighter">
                                      {r}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="text-[10px] text-muted-foreground font-medium flex-shrink-0 bg-secondary/20 px-2 py-1 rounded-md mb-0.5 sm:mb-0">
                            SUBMITTED: {claim.claim_date ? new Date(claim.claim_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A"}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Message dialog for match items */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message to {messageTarget?.name}</DialogTitle>
            <DialogDescription>{messageTarget?.context}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea value={matchMessage} onChange={(e) => setMatchMessage(e.target.value)} placeholder="Type your message..." className="min-h-[100px]" />
            <Button
              className="w-full gap-2 bg-primary text-primary-foreground"
              disabled={!matchMessage.trim()}
              onClick={async () => {
                if (!messageTarget || !matchMessage.trim() || !currentUser) return;
                const { error } = await supabase.from("notifications").insert({
                  user_id: messageTarget.userId,
                  message: matchMessage.trim(),
                  status: "unread",
                  type: "admin_message",
                  sender_id: currentUser.id,
                });
                if (error) { toast.error("Failed to send message"); }
                else {
                  // Send email notification
                  sendEmailNotification(messageTarget.userId, matchMessage.trim(), "admin_message");
                  toast.success(`Message sent to ${messageTarget.name}!`);
                  setMessageDialogOpen(false);
                  setMatchMessage("");
                  setMessageTarget(null);
                }
              }}
            >
              <Send className="w-4 h-4" /> Send Message
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Message dialog for claims */}
      <Dialog open={claimMessageDialogOpen} onOpenChange={setClaimMessageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message to {claimMessageTarget?.name}</DialogTitle>
            <DialogDescription>Send a message regarding their claim.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea value={claimMessage} onChange={(e) => setClaimMessage(e.target.value)} placeholder="Type your message..." className="min-h-[100px]" />
            <Button
              className="w-full gap-2 bg-primary text-primary-foreground"
              disabled={!claimMessage.trim()}
              onClick={async () => {
                if (!claimMessageTarget || !claimMessage.trim() || !currentUser) return;
                const { error } = await supabase.from("notifications").insert({
                  user_id: claimMessageTarget.userId,
                  message: claimMessage.trim(),
                  status: "unread",
                  type: "admin_message",
                  sender_id: currentUser.id,
                });
                if (error) { toast.error("Failed to send message"); }
                else {
                  // Send email notification
                  sendEmailNotification(claimMessageTarget.userId, claimMessage.trim(), "admin_message");
                  toast.success(`Message sent to ${claimMessageTarget.name}!`);
                  setClaimMessageDialogOpen(false);
                  setClaimMessage("");
                  setClaimMessageTarget(null);
                }
              }}
            >
              <Send className="w-4 h-4" /> Send Message
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
};

export default AdminDashboard;
