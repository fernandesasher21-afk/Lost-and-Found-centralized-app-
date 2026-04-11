import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, Search, Clock, CheckCircle, AlertTriangle, ArrowRight, TrendingUp, Sparkles, MapPin, Calendar, Tag, HandMetal, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { categories } from "@/lib/mockData";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  Lost: "bg-destructive/20 text-destructive",
  Found: "bg-primary/20 text-primary",
  Matched: "bg-accent/20 text-accent",
  Returned: "bg-success/20 text-success",
  Claimed: "bg-warning/20 text-warning",
};

// Text-based matching for items without embeddings
function calculateTextMatch(lostItem: any, foundItem: any) {
  let score = 0;
  const reasons: string[] = [];

  // Category match (weight: 0.25)
  if (lostItem.category && foundItem.category && lostItem.category.toLowerCase() === foundItem.category.toLowerCase()) {
    score += 0.25;
    reasons.push("Category match");
  }

  // Subcategory match (weight: 0.20)
  if (lostItem.subcategory && foundItem.subcategory && lostItem.subcategory.toLowerCase() === foundItem.subcategory.toLowerCase()) {
    score += 0.20;
    reasons.push("Subcategory match");
  }

  // Location match (weight: 0.15)
  if (lostItem.location && foundItem.location) {
    const ll = lostItem.location.toLowerCase();
    const fl = foundItem.location.toLowerCase();
    if (ll === fl) { score += 0.15; reasons.push("Same location"); }
    else if (ll.includes(fl) || fl.includes(ll)) { score += 0.10; reasons.push("Similar location"); }
  }

  // Description similarity (weight: 0.25)
  if (lostItem.description && foundItem.description) {
    const lostWords = new Set(lostItem.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
    const foundWords = new Set(foundItem.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
    const intersection = [...lostWords].filter(w => foundWords.has(w));
    const union = new Set([...lostWords, ...foundWords]);
    if (union.size > 0) {
      const similarity = intersection.length / union.size;
      score += 0.25 * similarity;
      if (similarity > 0.2) reasons.push("Description match");
    }
  }

  // Name similarity (weight: 0.05)
  if (lostItem.name && foundItem.name && lostItem.name.toLowerCase().includes(foundItem.name.toLowerCase())) {
    score += 0.05;
    reasons.push("Name match");
  }

  // Date proximity (weight: 0.10)
  if (lostItem.date_lost && foundItem.date_found) {
    const diff = Math.abs(new Date(lostItem.date_lost).getTime() - new Date(foundItem.date_found).getTime()) / (1000 * 60 * 60 * 24);
    if (diff <= 1) { score += 0.10; reasons.push("Same day"); }
    else if (diff <= 3) { score += 0.07; reasons.push("Within 3 days"); }
    else if (diff <= 7) { score += 0.04; reasons.push("Within a week"); }
    else if (diff <= 15) { score += 0.02; reasons.push("Within 15 days"); }
  }

  return { score, reasons };
}

const Dashboard = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialTab = (searchParams.get("tab") as any) || "lost";
  const [tab, setTab] = useState<"lost" | "history" | "claims" | "matches">(initialTab === "notifications" ? "lost" : (initialTab === "found" ? "history" : initialTab));
  const [lostItems, setLostItems] = useState<any[]>([]);
  const [recoveredItems, setRecoveredItems] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Claim dialog state
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimingMatch, setClaimingMatch] = useState<any>(null);
  const [claimDetails, setClaimDetails] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDateLost, setEditDateLost] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam && tabParam !== "notifications") {
      setTab(tabParam === "found" ? "history" : tabParam as any);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      const [lostRes, recoveredRes, claimsRes] = await Promise.all([
        supabase.from("Lost_Item").select("*").eq("user_id", user.id),
        supabase.from("Lost_Item").select("*").eq("user_id", user.id).eq("status", "Returned"),
        supabase.from("Claim").select("*, Found_Item(name, category, location, description)").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      if (lostRes.data) setLostItems(lostRes.data);
      if (recoveredRes.data) setRecoveredItems(recoveredRes.data);
      if (claimsRes.data) setClaims(claimsRes.data);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  // Fetch AI matches (image-based) + text-based fallback
  const fetchMatches = async () => {
    if (!user) return;
    setMatchLoading(true);
    try {
      // Get ALL user's lost items
      const { data: userLostItems } = await supabase
        .from("Lost_Item")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "Lost");

      if (!userLostItems || userLostItems.length === 0) {
        setMatches([]);
        setMatchLoading(false);
        return;
      }

      // Get all found items for text-based matching
      const { data: allFoundItems } = await supabase
        .from("Found_Item")
        .select("*")
        .eq("status", "Found");

      const allMatches: any[] = [];
      const PHOTO_THRESHOLD = 0.5;

      for (const lostItem of userLostItems) {
        // STEP 1: Try photo/embedding comparison first. Only do matches if they uploaded an image!
        if (lostItem.lost_embedding) {
          const { data: matchData } = await supabase.rpc("match_lost_to_found", {
            _embedding: lostItem.lost_embedding,
            _subcategory: lostItem.subcategory || lostItem.category || "",
            _limit: 3,
          });

          if (matchData && matchData.length > 0) {
            for (const m of matchData) {
              if (m.similarity >= 0.80) { // Keep matches > 80%
                allMatches.push({
                  lost_item: lostItem,
                  found_item: m,
                  image_similarity: m.similarity,
                  subcategory_match: !!(lostItem.subcategory && m.subcategory && lostItem.subcategory.toLowerCase() === m.subcategory.toLowerCase()),
                  location_match: !!(lostItem.location && m.location && (lostItem.location.toLowerCase().includes(m.location.toLowerCase()) || m.location.toLowerCase().includes(lostItem.location.toLowerCase()))),
                  date_proximity: 0,
                  final_score: m.similarity,
                  match_type: "photo",
                });
              }
            }
          }
        }
      }

      allMatches.sort((a, b) => b.final_score - a.final_score);
      // Keep top 3 per lost item
      const topMatches: any[] = [];
      const seenPerLost: Record<number, number> = {};
      for (const m of allMatches) {
        const count = seenPerLost[m.lost_item.lost_id] || 0;
        if (count < 3) {
          topMatches.push(m);
          seenPerLost[m.lost_item.lost_id] = count + 1;
        }
      }
      setMatches(topMatches);
    } catch (err) {
      console.error("Match fetch error:", err);
    } finally {
      setMatchLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "matches") fetchMatches();
  }, [tab, user]);

  const handleClaimItem = async () => {
    if (!user || !claimingMatch || !claimDetails.trim()) return;
    setClaimSubmitting(true);
    try {
      const foundItem = claimingMatch.found_item;
      const { error } = await supabase.from("Claim").insert({
        user_id: user.id,
        item_id: foundItem.found_id,
        verification_details: claimDetails.trim(),
        claim_status: "pending",
      });
      if (error) throw error;

      // Auto-verification: check if user's lost items match this found item ≥90%
      let autoApproved = false;
      try {
        const matchScore = claimingMatch.similarity || 0;
        const lostItem = claimingMatch.lost_item;
        
        // Also do text match as fallback
        const textScore = calculateTextMatch(
          { ...lostItem, date_lost: lostItem?.date_lost },
          { ...foundItem, date_found: foundItem?.date_found }
        ).score;

        const bestScore = Math.max(matchScore, textScore);

        if (bestScore >= 0.90) {
          // Auto-approve
          const { data: insertedClaim } = await supabase
            .from("Claim")
            .select("claim_id")
            .eq("item_id", foundItem.found_id)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (insertedClaim && insertedClaim.length > 0) {
            await supabase.from("Claim").update({ claim_status: "approved" }).eq("claim_id", insertedClaim[0].claim_id);
            await supabase.from("Found_Item").update({ status: "Claimed" }).eq("found_id", foundItem.found_id);
            if (lostItem?.lost_id) {
              await supabase.from("Lost_Item").update({ status: "Matched" }).eq("lost_id", lostItem.lost_id);
            }
            await supabase.from("notifications").insert({
              user_id: user.id,
              message: `✅ Your claim for "${foundItem.name || "Unknown Item"}" has been auto-approved with ${Math.round(bestScore * 100)}% match! Please collect your item from the office.`,
              status: "unread",
              type: "claim",
              sender_id: user.id,
            });
            autoApproved = true;
            toast.success(`🎉 Auto-approved! ${Math.round(bestScore * 100)}% match. Collect your item from the office!`, { duration: 6000 });
          }
        }
      } catch (autoErr) {
        console.error("Auto-verification error:", autoErr);
      }

      if (!autoApproved) {
        // Notify admins for manual review
        const { data: admins } = await supabase.from("User").select("id").eq("role", "admin");
        if (admins && admins.length > 0) {
          await supabase.from("notifications").insert(
            admins.map(admin => ({
              user_id: admin.id,
              message: `📋 New claim submitted by ${user.name || user.email} for item "${foundItem.name || "Unknown Item"}".`,
              status: "unread",
              type: "claim",
              sender_id: user.id,
            }))
          );
        }
        toast.success("Claim submitted successfully! The incharge will review it.");
      }

      setClaimDialogOpen(false);
      setClaimingMatch(null);
      setClaimDetails("");
      const { data: claimsRes } = await supabase.from("Claim").select("*, Found_Item(name, category, location, description)").eq("user_id", user.id).order("created_at", { ascending: false });
      if (claimsRes) setClaims(claimsRes);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit claim");
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editingItem || !editName.trim() || !editCategory || !editLocation.trim()) return;
    setEditSubmitting(true);
    try {
      const { error } = await supabase
        .from("Lost_Item")
        .update({
          name: editName,
          category: editCategory,
          subcategory: editSubcategory,
          location: editLocation,
          date_lost: editDateLost,
          description: editDescription,
        })
        .eq("lost_id", editingItem.lost_id);
      
      if (error) throw error;

      toast.success("Item updated successfully");
      setLostItems(prev => prev.map(item => 
        item.lost_id === editingItem.lost_id 
          ? { ...item, name: editName, category: editCategory, subcategory: editSubcategory, location: editLocation, date_lost: editDateLost, description: editDescription } 
          : item
      ));
      setEditDialogOpen(false);
      setEditingItem(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update item");
    } finally {
      setEditSubmitting(false);
    }
  };

  const statCards = [
    { icon: AlertTriangle, label: "My Lost Items", value: lostItems.length, color: "text-destructive", bg: "bg-destructive/10" },
    { icon: CheckCircle, label: "Recovered", value: recoveredItems.length, color: "text-success", bg: "bg-success/10" },
    { icon: Clock, label: "Pending", value: lostItems.filter(i => i.status === "Lost" || i.status === "Matched").length, color: "text-accent", bg: "bg-accent/10" },
    { icon: TrendingUp, label: "Claimed", value: lostItems.filter(i => i.status === "Claimed").length, color: "text-primary", bg: "bg-primary/10" },
  ];

  const getSimilarityLabel = (score: number) => {
    if (score > 0.80) return { text: "High Match Probability", color: "text-green-400" };
    if (score > 0.65) return { text: "Good", color: "text-emerald-400" };
    if (score > 0.50) return { text: "Moderate", color: "text-yellow-400" };
    return { text: "Weak", color: "text-red-400" };
  };

  return (
    <PageTransition className="min-h-screen pt-24 pb-10 relative">
      <div className="absolute inset-0 mesh-bg opacity-30" />
      <div className="container px-4 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <span className="text-primary text-sm font-semibold tracking-widest uppercase mb-2 block">Overview</span>
          <h1 className="text-4xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Track your lost items and claims</p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {statCards.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -5, scale: 1.02 }} className="glass rounded-2xl p-6 group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className={`w-11 h-11 rounded-xl ${s.bg} flex items-center justify-center mb-4`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div className="text-3xl font-display font-bold text-foreground">{s.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 glass rounded-xl p-1.5 w-fit flex-wrap">
          {(["lost", "matches", "claims", "history"] as const).map((t) => (
            <Button key={t} variant="ghost" size="sm" onClick={() => setTab(t)} className={`rounded-lg h-9 px-5 text-sm font-medium transition-all ${tab === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "lost" ? "My Lost Items" : t === "matches" ? "🤖 AI Matches" : t === "claims" ? "My Claims" : "Recovery History"}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
              <Search className="w-8 h-8 mx-auto mb-3 text-primary/30" />
            </motion.div>
            Loading...
          </div>
        ) : (
          <>
            {tab === "lost" && (
              <div className="space-y-3">
                {lostItems.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 glass rounded-2xl">
                    <Package className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground">No lost items reported yet</p>
                  </motion.div>
                ) : lostItems.map((item, i) => (
                  <motion.div key={item.lost_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ x: 6 }} className="glass rounded-2xl p-5 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      {item.image_path && (
                        <img src={item.image_path} alt="" className="w-11 h-11 rounded-xl object-cover" />
                      )}
                      {!item.image_path && (
                        <div className="w-11 h-11 rounded-xl bg-destructive/10 flex items-center justify-center group-hover:bg-destructive/15 transition-colors">
                          <Package className="w-5 h-5 text-destructive" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-foreground">{item.name || item.description || "No description"}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{item.category} • {item.location} • {item.date_lost}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${statusColors[item.status] || ""} rounded-lg`}>{item.status}</Badge>
                      {item.status !== "Returned" && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(item);
                            setEditName(item.name || "");
                            setEditCategory(item.category || "");
                            setEditSubcategory(item.subcategory || "");
                            setEditLocation(item.location || "");
                            setEditDateLost(item.date_lost || "");
                            setEditDescription(item.description || "");
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
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
                            <AlertDialogTitle>Delete Lost Item</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{item.name || item.description || "this item"}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={async () => {
                                const { error } = await supabase.from("Lost_Item").delete().eq("lost_id", item.lost_id);
                                if (error) {
                                  toast.error("Failed to delete item");
                                } else {
                                  toast.success("Item deleted successfully");
                                  setLostItems(prev => prev.filter(i => i.lost_id !== item.lost_id));
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
                <Link to="/report-lost">
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button className="w-full bg-primary text-primary-foreground mt-4 h-12 rounded-xl text-base px-8 font-semibold glow gap-2">
                      + Report New Lost Item <ArrowRight className="w-4 h-4" />
                    </Button>
                  </motion.div>
                </Link>
              </div>
            )}

            {tab === "matches" && (
              <div className="space-y-4">
                {matchLoading ? (
                  <div className="text-center py-16 glass rounded-2xl">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                      <Sparkles className="w-10 h-10 mx-auto mb-3 text-primary/50" />
                    </motion.div>
                    <p className="text-muted-foreground">Analyzing matches...</p>
                  </div>
                ) : matches.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 glass rounded-2xl">
                    <Sparkles className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground">No matches found yet</p>
                    <p className="text-xs text-muted-foreground mt-2">Upload images when reporting items for better AI matching, or matches will be found based on item details</p>
                  </motion.div>
                ) : matches.map((match, i) => {
                  const simLabel = getSimilarityLabel(match.final_score);
                  const pct = Math.round(match.final_score * 100);
                  const dateDiff = match.lost_item.date_lost && match.found_item.date_found
                    ? Math.abs(Math.round((new Date(match.lost_item.date_lost).getTime() - new Date(match.found_item.date_found).getTime()) / (1000 * 60 * 60 * 24)))
                    : null;

                  return (
                    <motion.div
                      key={`${match.lost_item.lost_id}-${match.found_item.found_id}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="glass rounded-2xl p-6 space-y-4"
                    >
                      {/* Header with score */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <div className="font-bold text-lg text-foreground">{pct}% Match</div>
                            <div className="text-sm text-muted-foreground">
                              Your "{match.lost_item.name}" → Found "{match.found_item.name}"
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${match.match_type === "photo" ? "bg-blue-500/20 text-blue-400" : "bg-primary/20 text-primary"}`}>
                            {match.match_type === "photo" ? "📷 Visual Match" : "📝 Text Match"}
                          </Badge>
                          {pct > 80 && (
                            <Badge className="bg-success/20 text-success rounded-lg">High Match Probability</Badge>
                          )}
                          <Badge className={pct >= 80 ? "bg-success/20 text-success rounded-lg" : pct >= 65 ? "bg-accent/20 text-accent rounded-lg" : "bg-muted text-muted-foreground rounded-lg"}>
                            {simLabel.text}
                          </Badge>
                        </div>
                      </div>

                      {/* Images side by side */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">Your Lost Item</p>
                          {match.lost_item.image_path ? (
                            <img src={match.lost_item.image_path} alt="Lost" className="w-full h-32 object-cover rounded-xl" />
                          ) : (
                            <div className="w-full h-32 bg-secondary/50 rounded-xl flex items-center justify-center">
                              <Package className="w-8 h-8 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground font-medium">Found Item</p>
                          {match.found_item.image_path ? (
                            <img src={match.found_item.image_path} alt="Found" className="w-full h-32 object-cover rounded-xl" />
                          ) : (
                            <div className="w-full h-32 bg-secondary/50 rounded-xl flex items-center justify-center">
                              <Package className="w-8 h-8 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Match indicators */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {match.match_type === "photo" ? (
                          <div className="glass rounded-xl p-3 text-center">
                            <Sparkles className={`w-4 h-4 mx-auto mb-1 ${getSimilarityLabel(match.image_similarity).color}`} />
                            <div className={`text-sm font-semibold ${getSimilarityLabel(match.image_similarity).color}`}>Visual: {Math.round(match.image_similarity * 100)}%</div>
                          </div>
                        ) : (
                          <div className="glass rounded-xl p-3 text-center">
                            <Search className="w-4 h-4 mx-auto mb-1 text-primary" />
                            <div className="text-sm font-semibold text-primary">Text: {pct}%</div>
                            <div className="text-xs text-muted-foreground">{match.text_reasons?.length || 0} factors</div>
                          </div>
                        )}
                        <div className="glass rounded-xl p-3 text-center">
                          <Tag className={`w-4 h-4 mx-auto mb-1 ${match.subcategory_match ? "text-green-400" : "text-muted-foreground"}`} />
                          <div className={`text-sm font-semibold ${match.subcategory_match ? "text-green-400" : "text-muted-foreground"}`}>
                            {match.subcategory_match ? "Same Type" : "Different Type"}
                          </div>
                        </div>
                        <div className="glass rounded-xl p-3 text-center">
                          <MapPin className={`w-4 h-4 mx-auto mb-1 ${match.location_match ? "text-green-400" : "text-muted-foreground"}`} />
                          <div className={`text-sm font-semibold ${match.location_match ? "text-green-400" : "text-muted-foreground"}`}>
                            {match.location_match ? "Same Location" : "Different Location"}
                          </div>
                        </div>
                        <div className="glass rounded-xl p-3 text-center">
                          <Calendar className={`w-4 h-4 mx-auto mb-1 ${match.date_proximity > 0.5 ? "text-green-400" : "text-muted-foreground"}`} />
                          <div className={`text-sm font-semibold ${match.date_proximity > 0.5 ? "text-green-400" : "text-muted-foreground"}`}>
                            {dateDiff !== null ? `Within ${dateDiff} Days` : "Unknown"}
                          </div>
                        </div>
                      </div>

                      {/* Text match reasons */}
                      {match.match_type === "text" && match.text_reasons && match.text_reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {match.text_reasons.map((r: string) => (
                            <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                          ))}
                        </div>
                      )}

                      {/* View & Claim button - redirects to browse items */}
                      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                        <Button
                          className="w-full bg-primary text-primary-foreground gap-2 h-11 rounded-xl font-semibold"
                          onClick={() => navigate(`/items?claim=${match.found_item.found_id}`)}
                        >
                          <ArrowRight className="w-4 h-4" /> View & Claim This Item
                        </Button>
                      </motion.div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {tab === "claims" && (
              <div className="space-y-3">
                {claims.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 glass rounded-2xl">
                    <Search className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground">No claims submitted yet</p>
                  </motion.div>
                ) : claims.map((claim, i) => {
                  const claimStatusColors: Record<string, string> = {
                    pending: "bg-warning/20 text-warning",
                    approved: "bg-success/20 text-success",
                    rejected: "bg-destructive/20 text-destructive",
                  };
                  const foundItem = claim.Found_Item;
                  return (
                    <motion.div key={claim.claim_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} whileHover={{ x: 6 }} className="glass rounded-2xl p-5 flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{foundItem?.name || foundItem?.description || "Unknown Item"}</div>
                          <div className="text-sm text-muted-foreground mt-0.5">{foundItem?.category} • {foundItem?.location} • {claim.claim_date?.split("T")[0]}</div>
                          {claim.verification_details && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">Details: {claim.verification_details}</div>}
                        </div>
                      </div>
                      <Badge className={`${claimStatusColors[claim.claim_status] || ""} rounded-lg`}>{claim.claim_status?.charAt(0).toUpperCase() + claim.claim_status?.slice(1)}</Badge>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {tab === "history" && (
              <div className="space-y-3">
                {recoveredItems.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 glass rounded-2xl">
                    <CheckCircle className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                    <p className="text-muted-foreground">No recovered items yet</p>
                  </motion.div>
                ) : recoveredItems.map((item, i) => (
                  <motion.div
                    key={item.lost_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ x: 6 }}
                    className="glass rounded-2xl p-5 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-xl bg-success/10 flex items-center justify-center group-hover:bg-success/15 transition-colors">
                        <CheckCircle className="w-5 h-5 text-success" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{item.name || item.description || "No description"}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">{item.category} • {item.location} • {item.date_lost}</div>
                      </div>
                    </div>
                    <Badge className="bg-success/20 text-success rounded-lg">Recovered</Badge>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Claim Dialog */}
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Claim This Item</DialogTitle>
            <DialogDescription>
              Provide verification details to prove this is your item. The incharge will review your claim.
            </DialogDescription>
          </DialogHeader>
          {claimingMatch && (
            <div className="space-y-4">
              <div className="glass rounded-xl p-3">
                <div className="text-sm font-medium text-foreground">{claimingMatch.found_item.name}</div>
                <div className="text-xs text-muted-foreground">{claimingMatch.found_item.category} • {claimingMatch.found_item.location}</div>
                <div className="text-xs text-primary mt-1">{Math.round(claimingMatch.final_score * 100)}% match with your "{claimingMatch.lost_item.name}"</div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Verification Details *</Label>
                <Textarea
                  value={claimDetails}
                  onChange={(e) => setClaimDetails(e.target.value)}
                  placeholder="Describe specific details to prove ownership (color, brand, marks, contents, serial number...)"
                  className="min-h-[100px]"
                />
              </div>
              <Button
                className="w-full gap-2 bg-primary text-primary-foreground"
                disabled={!claimDetails.trim() || claimSubmitting}
                onClick={handleClaimItem}
              >
                {claimSubmitting ? "Submitting..." : <><HandMetal className="w-4 h-4" /> Submit Claim</>}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Lost Item Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Lost Item: {editingItem?.name}</DialogTitle>
            <DialogDescription>Update the details of your lost item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="e.g. Blue Backpack" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subcategory (Optional)</Label>
                <Input value={editSubcategory} onChange={(e) => setEditSubcategory(e.target.value)} placeholder="e.g. Phone, Wallet" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="e.g. Library 2nd Floor" />
              </div>
              <div className="space-y-2">
                <Label>Date Lost</Label>
                <Input type="date" value={editDateLost} onChange={(e) => setEditDateLost(e.target.value)} max={new Date().toISOString().split("T")[0]} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="min-h-[100px]" placeholder="Additional details..." />
            </div>
            <Button
              className="w-full gap-2 bg-primary text-primary-foreground mt-2"
              disabled={editSubmitting || !editName.trim() || !editCategory || !editLocation.trim()}
              onClick={handleEditSubmit}
            >
              {editSubmitting ? "Saving Changes..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
};

export default Dashboard;
