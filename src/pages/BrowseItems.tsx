import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Package, Eye, MapPin, Calendar, Pencil, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { categories, locations } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// Text-based matching for auto-verification
function calculateTextMatchScore(lostItem: any, foundItem: any): number {
  let score = 0;
  if (lostItem.category && foundItem.category && lostItem.category.toLowerCase() === foundItem.category.toLowerCase()) score += 0.25;
  if (lostItem.subcategory && foundItem.subcategory && lostItem.subcategory.toLowerCase() === foundItem.subcategory.toLowerCase()) score += 0.20;
  if (lostItem.location && foundItem.location) {
    const ll = lostItem.location.toLowerCase(), fl = foundItem.location.toLowerCase();
    if (ll === fl) score += 0.15;
    else if (ll.includes(fl) || fl.includes(ll)) score += 0.10;
  }
  if (lostItem.description && foundItem.description) {
    const lw = new Set(lostItem.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
    const fw = new Set(foundItem.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
    const inter = [...lw].filter(w => fw.has(w));
    const union = new Set([...lw, ...fw]);
    if (union.size > 0) score += 0.25 * (inter.length / union.size);
  }
  if (lostItem.name && foundItem.name && lostItem.name.toLowerCase().includes(foundItem.name.toLowerCase())) score += 0.05;
  if (lostItem.date_lost && foundItem.date_found) {
    const diff = Math.abs(new Date(lostItem.date_lost).getTime() - new Date(foundItem.date_found).getTime()) / (1000 * 60 * 60 * 24);
    if (diff <= 1) score += 0.10;
    else if (diff <= 3) score += 0.07;
    else if (diff <= 7) score += 0.04;
    else if (diff <= 15) score += 0.02;
  }
  return score;
}

const statusColors: Record<string, string> = {
  Lost: "bg-destructive/20 text-destructive",
  Found: "bg-primary/20 text-primary",
  Matched: "bg-accent/20 text-accent",
  Returned: "bg-success/20 text-success",
  Claimed: "bg-warning/20 text-warning",
};

interface LostItemRow {
  lost_id: number;
  name: string | null;
  category: string;
  status: string | null;
  location: string | null;
  date_lost: string | null;
  description: string | null;
  image_path: string | null;
}

interface FoundItemRow {
  found_id: number;
  name: string | null;
  category: string | null;
  status: string;
  location: string | null;
  date_found: string | null;
  description: string | null;
  image_path: string | null;
}

const BrowseItems = () => {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<"lost" | "found">("lost");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lostItems, setLostItems] = useState<LostItemRow[]>([]);
  const [foundItems, setFoundItems] = useState<FoundItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, isStaffOrAdmin } = useAuth();

  // Claim dialog
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimItem, setClaimItem] = useState<FoundItemRow | null>(null);
  const [claimName, setClaimName] = useState("");
  const [claimCategory, setClaimCategory] = useState("");
  const [claimCustomCategory, setClaimCustomCategory] = useState("");
  const [claimLocation, setClaimLocation] = useState("");
  const [claimDate, setClaimDate] = useState("");
  const [claimDescription, setClaimDescription] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimPhoto, setClaimPhoto] = useState<File | null>(null);
  const [userClaimedItemIds, setUserClaimedItemIds] = useState<Set<number>>(new Set());

  // Status timeline dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusItem, setStatusItem] = useState<FoundItemRow | null>(null);

  // Image preview dialog
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<LostItemRow | FoundItemRow | null>(null);

  // Found item detail/edit dialog (for incharge/admin)
  const [foundDetailOpen, setFoundDetailOpen] = useState(false);
  const [foundDetailItem, setFoundDetailItem] = useState<FoundItemRow | null>(null);
  const [editingFound, setEditingFound] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDateFound, setEditDateFound] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      const [lostRes, foundRes] = await Promise.all([
        supabase.from("Lost_Item").select("*").order("date_lost", { ascending: false }),
        supabase.from("Found_Item").select("*").order("date_found", { ascending: false }),
      ]);
      if (lostRes.data) {
        // Sort: active items first, then recovered (Returned) items at the end
        const activeLost = lostRes.data.filter(l => l.status !== "Returned");
        const recoveredLost = lostRes.data.filter(l => l.status === "Returned");
        setLostItems([...activeLost, ...recoveredLost]);
      }
      if (foundRes.data) {
        // Sort: active (Found) items first, then recovered (Returned) items at the end
        const activeFound = foundRes.data.filter(f => f.status !== "Returned");
        const recoveredFound = foundRes.data.filter(f => f.status === "Returned");
        setFoundItems([...activeFound, ...recoveredFound]);
      }

      // Fetch user's existing claims
      if (user) {
        const { data: userClaims } = await supabase.from("Claim").select("item_id").eq("user_id", user.id);
        if (userClaims) {
          setUserClaimedItemIds(new Set(userClaims.map(c => c.item_id).filter(Boolean) as number[]));
        }
      }

      setLoading(false);
    };
    fetchItems();
  }, [user]);

  // Handle claim param from dashboard redirect
  useEffect(() => {
    const claimId = searchParams.get("claim");
    if (claimId && foundItems.length > 0) {
      const itemToClaim = foundItems.find(f => f.found_id === parseInt(claimId));
      if (itemToClaim && itemToClaim.status === "Found") {
        setTab("found");
        setClaimItem(itemToClaim);
        setClaimDialogOpen(true);
      }
    }
  }, [searchParams, foundItems]);

  const filteredLost = lostItems.filter((item) => {
    const matchesSearch = (item.name || "").toLowerCase().includes(search.toLowerCase()) || (item.description || "").toLowerCase().includes(search.toLowerCase()) || (item.location || "").toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const filteredFound = foundItems.filter((item) => {
    const matchesSearch = (item.name || "").toLowerCase().includes(search.toLowerCase()) || (item.description || "").toLowerCase().includes(search.toLowerCase()) || (item.location || "").toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const handleClaim = async () => {
    if (!user || !claimItem) {
      toast.error("You must be logged in to claim an item");
      return;
    }
    const finalClaimCategory = claimCategory === "Other" ? claimCustomCategory : claimCategory;
    if (!claimName.trim() || !finalClaimCategory || !claimLocation.trim() || !claimDate || !claimDescription.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setClaimSubmitting(true);

    // Check if user already claimed this item
    const { data: existingClaim } = await supabase
      .from("Claim")
      .select("claim_id")
      .eq("item_id", claimItem.found_id)
      .eq("user_id", user.id)
      .limit(1);

    if (existingClaim && existingClaim.length > 0) {
      toast.error("You have already submitted a claim for this item.");
      setClaimSubmitting(false);
      return;
    }

    let photoBase64: string | null = null;
    if (claimPhoto) {
      const reader = new FileReader();
      photoBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(claimPhoto);
      });
    }

    const details = [
      `Name: ${claimName}`,
      `Category: ${finalClaimCategory}`,
      `Location: ${claimLocation}`,
      `Date: ${claimDate}`,
      `Description: ${claimDescription}`,
      photoBase64 && `Photo: ${photoBase64}`,
    ].filter(Boolean).join(" | ");

    const { error } = await supabase.from("Claim").insert({
      item_id: claimItem.found_id,
      user_id: user.id,
      claim_status: "pending",
      verification_details: details,
    });
    if (error) {
      toast.error("Failed to submit claim");
    } else {
      // Auto-verification: compare student's lost items with the claimed found item
      let autoApproved = false;
      try {
        const { data: studentLostItems } = await supabase
          .from("Lost_Item")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "Lost");

        if (studentLostItems && studentLostItems.length > 0) {
          let bestMatch = 0;
          let bestLostItem: any = null;

          // First try embedding-based comparison
          const foundItemFull = foundItems.find(f => f.found_id === claimItem.found_id);
          
          for (const lostItem of studentLostItems) {
            // Use text-based matching
            const textScore = calculateTextMatchScore(lostItem, {
              ...foundItemFull,
              date_found: foundItemFull?.date_found,
            });
            if (textScore > bestMatch) {
              bestMatch = textScore;
              bestLostItem = lostItem;
            }
          }

          // Also try embedding match via RPC if the found item has an embedding
          try {
            const { data: foundEmbeddingItem } = await supabase
              .from("Found_Item")
              .select("found_embedding")
              .eq("found_id", claimItem.found_id)
              .single();

            if (foundEmbeddingItem?.found_embedding) {
              const { data: embeddingMatches } = await supabase.rpc("match_found_to_lost", {
                _embedding: foundEmbeddingItem.found_embedding,
                _subcategory: foundItemFull?.category || "",
                _limit: 5,
              });

              if (embeddingMatches) {
                for (const match of embeddingMatches) {
                  if (match.user_id === user.id && match.similarity > bestMatch) {
                    bestMatch = match.similarity;
                    bestLostItem = match;
                  }
                }
              }
            }
          } catch (embErr) {
            console.log("Embedding comparison skipped:", embErr);
          }

          // If match ≥ 90%, auto-approve
          if (bestMatch >= 0.90 && bestLostItem) {
            // Get the claim we just inserted
            const { data: insertedClaim } = await supabase
              .from("Claim")
              .select("claim_id")
              .eq("item_id", claimItem.found_id)
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1);

            if (insertedClaim && insertedClaim.length > 0) {
              await supabase
                .from("Claim")
                .update({ claim_status: "approved" })
                .eq("claim_id", insertedClaim[0].claim_id);

              // Update found item status to Claimed
              await supabase
                .from("Found_Item")
                .update({ status: "Claimed" })
                .eq("found_id", claimItem.found_id);

              // Update the student's lost item status
              const lostId = bestLostItem.lost_id;
              if (lostId) {
                await supabase
                  .from("Lost_Item")
                  .update({ status: "Matched" })
                  .eq("lost_id", lostId);
              }

              // Send notification to student
              await supabase.from("notifications").insert({
                user_id: user.id,
                message: `✅ Your claim for "${claimItem.name || "Unknown Item"}" has been auto-approved with ${Math.round(bestMatch * 100)}% match! Please collect your item from the office.`,
                status: "unread",
                type: "claim",
                sender_id: user.id,
              });

              autoApproved = true;
              toast.success(
                `🎉 Auto-approved! ${Math.round(bestMatch * 100)}% match with your lost item. Collect your item from the office!`,
                { duration: 6000 }
              );
            }
          }
        }
      } catch (autoErr) {
        console.error("Auto-verification error:", autoErr);
      }

      if (!autoApproved) {
        // Send notification to all admins for manual review
        const { data: admins } = await supabase.from("User").select("id").eq("role", "admin");
        if (admins && admins.length > 0) {
          const notifications = admins.map(admin => ({
            user_id: admin.id,
            message: `📋 New claim submitted by ${user.name || user.email} for item "${claimItem.name || "Unknown Item"}".`,
            status: "unread",
            type: "claim",
            sender_id: user.id,
          }));
          await supabase.from("notifications").insert(notifications);
        }
        toast.success("Claim submitted successfully! The incharge will review it.");
      }

      setUserClaimedItemIds(prev => new Set([...prev, claimItem.found_id]));
      setClaimDialogOpen(false);
      resetClaimForm();
      setClaimItem(null);
    }
    setClaimSubmitting(false);
  };

  const resetClaimForm = () => {
    setClaimName("");
    setClaimCategory("");
    setClaimCustomCategory("");
    setClaimLocation("");
    setClaimDate("");
    setClaimDescription("");
    setClaimPhoto(null);
  };

  const openEditMode = () => {
    if (!foundDetailItem) return;
    setEditName(foundDetailItem.name || "");
    setEditCategory(foundDetailItem.category || "");
    setEditLocation(foundDetailItem.location || "");
    setEditDateFound(foundDetailItem.date_found || "");
    setEditDescription(foundDetailItem.description || "");
    setEditStatus(foundDetailItem.status || "Found");
    setEditingFound(true);
  };

  const handleEditFoundItem = async () => {
    if (!foundDetailItem) return;
    setEditSubmitting(true);
    const { error } = await supabase
      .from("Found_Item")
      .update({
        name: editName,
        category: editCategory,
        location: editLocation,
        date_found: editDateFound || null,
        description: editDescription,
        status: editStatus,
      })
      .eq("found_id", foundDetailItem.found_id);
    if (error) {
      toast.error("Failed to update item");
    } else {
      toast.success("Item updated successfully!");
      setFoundItems((prev) =>
        prev.map((f) =>
          f.found_id === foundDetailItem.found_id
            ? { ...f, name: editName, category: editCategory, location: editLocation, date_found: editDateFound, description: editDescription, status: editStatus }
            : f
        )
      );
      setFoundDetailItem({ ...foundDetailItem, name: editName, category: editCategory, location: editLocation, date_found: editDateFound, description: editDescription, status: editStatus });
      setEditingFound(false);
    }
    setEditSubmitting(false);
  };

  const getStatusTimeline = (status: string) => {
    const steps = ["Found", "Matched", "Verified", "Returned"];
    const currentIndex = steps.indexOf(status);
    return steps.map((step, i) => ({
      label: step,
      completed: i <= currentIndex,
      current: i === currentIndex,
    }));
  };

  return (
    <PageTransition className="min-h-screen pt-24 pb-10 relative">
      <div className="absolute inset-0 mesh-bg opacity-30" />
      <div className="container px-4 relative">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <span className="text-primary text-sm font-semibold tracking-widest uppercase mb-2 block">Browse</span>
          <h1 className="text-4xl font-display font-bold text-foreground">Browse Items</h1>
          <p className="text-muted-foreground mt-2">Search through lost and found items on campus</p>
        </motion.div>

        {/* Search & Filters */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-4 mb-8 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, description or location..." className="bg-secondary/50 border-border/30 pl-10 h-11 rounded-xl" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="bg-secondary/50 border-border/30 w-full md:w-48 h-11 rounded-xl">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 glass rounded-xl p-1.5 w-fit">
          <Button variant="ghost" size="sm" onClick={() => setTab("lost")} className={`rounded-lg h-9 px-5 text-sm font-medium gap-2 transition-all ${tab === "lost" ? "bg-destructive text-destructive-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Package className="w-4 h-4" /> Lost Items ({filteredLost.length})
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setTab("found")} className={`rounded-lg h-9 px-5 text-sm font-medium gap-2 transition-all ${tab === "found" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <Eye className="w-4 h-4" /> Found Items ({filteredFound.length})
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading items...</div>
        ) : (
          <>
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {(tab === "lost" ? filteredLost : filteredFound).map((item, i) => (
                  <motion.div
                    key={"lost_id" in item ? item.lost_id : item.found_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -8, scale: 1.01 }}
                    className="glass rounded-2xl overflow-hidden group cursor-pointer relative"
                    onClick={() => {
                      if (tab === "found") {
                        const foundItem = item as FoundItemRow;
                        if (isStaffOrAdmin) {
                          setFoundDetailItem(foundItem);
                          setEditingFound(false);
                          setFoundDetailOpen(true);
                        } else if (foundItem.status === "Found" && !userClaimedItemIds.has(foundItem.found_id)) {
                          setClaimItem(foundItem);
                          setClaimDialogOpen(true);
                        } else if (foundItem.status !== "Found") {
                          setStatusItem(foundItem);
                          setStatusDialogOpen(true);
                        }
                      }
                    }}
                  >
                    {tab === "lost" ? (
                      <>
                        <div className="h-36 bg-gradient-to-br from-secondary to-background flex items-center justify-center overflow-hidden relative"
                          onClick={(e) => {
                            if ((item as LostItemRow).image_path) {
                              e.stopPropagation();
                              setPreviewItem(item as LostItemRow);
                              setPreviewDialogOpen(true);
                            }
                          }}
                        >
                          {(item as LostItemRow).image_path ? (
                            <img src={(item as LostItemRow).image_path!} alt={item.name || "Lost item"} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" />
                          ) : (
                            <Package className="w-12 h-12 text-muted-foreground/30 group-hover:text-destructive/50 transition-colors" />
                          )}
                        </div>
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-medium text-foreground text-sm leading-tight">{item.name || item.description || "No description"}</h3>
                            <Badge className={`ml-2 text-xs ${statusColors[item.status || ""] || ""}`}>{item.status}</Badge>
                          </div>
                          <div className="space-y-1.5 mt-3">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Package className="w-3.5 h-3.5" /> {item.category || "Unknown"}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5" /> {item.location || "Unknown"}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5" /> {(item as LostItemRow).date_lost || "N/A"}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-36 bg-gradient-to-br from-secondary to-background flex items-center justify-center overflow-hidden relative"
                          onClick={(e) => {
                            if ((item as FoundItemRow).image_path) {
                              e.stopPropagation();
                              setPreviewItem(item as FoundItemRow);
                              setPreviewDialogOpen(true);
                            }
                          }}
                        >
                          {(item as FoundItemRow).image_path ? (
                            <img src={(item as FoundItemRow).image_path!} alt={item.name || "Found item"} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform" />
                          ) : (
                            <Eye className="w-12 h-12 text-muted-foreground/30 group-hover:text-primary/50 transition-colors" />
                          )}
                        </div>
                        <div className="p-5">
                          <div className="flex items-start justify-between">
                            <h3 className="font-medium text-foreground text-sm leading-tight">{item.name || "Unknown Item"}</h3>
                            <Badge className={`ml-2 text-xs ${statusColors[item.status || ""] || ""}`}>{item.status}</Badge>
                          </div>
                          {!isStaffOrAdmin && item.status === "Found" && !userClaimedItemIds.has((item as FoundItemRow).found_id) && (
                            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="mt-4">
                             <Button size="sm" className="w-full bg-primary text-primary-foreground text-xs rounded-lg glow-hover">Claim This Item</Button>
                            </motion.div>
                          )}
                          {!isStaffOrAdmin && item.status === "Found" && userClaimedItemIds.has((item as FoundItemRow).found_id) && (
                            <div className="mt-4">
                              <Button size="sm" disabled className="w-full text-xs bg-muted text-muted-foreground cursor-not-allowed">Claimed</Button>
                            </div>
                          )}
                          {item.status !== "Found" && (
                            <p className="text-xs text-muted-foreground mt-2">Click to view status</p>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>

            {(tab === "lost" ? filteredLost : filteredFound).length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
                <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">No items found matching your search.</p>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* Claim Dialog - report-style fields */}
      <Dialog open={claimDialogOpen} onOpenChange={(open) => { setClaimDialogOpen(open); if (!open) resetClaimForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Claim Item: {claimItem?.name || "Item"}</DialogTitle>
            <DialogDescription>
              Provide details about your item to help verify your claim. All fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input value={claimName} onChange={(e) => setClaimName(e.target.value)} placeholder="e.g. Blue Backpack, iPhone 15..." className="bg-secondary border-0" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={claimCategory} onValueChange={(v) => { setClaimCategory(v); if (v !== "Other") setClaimCustomCategory(""); }}>
                  <SelectTrigger className="bg-secondary border-0"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                    <SelectItem value="Other">Other (specify)</SelectItem>
                  </SelectContent>
                </Select>
                {claimCategory === "Other" && (
                  <Input value={claimCustomCategory} onChange={(e) => setClaimCustomCategory(e.target.value)} placeholder="Enter custom category..." className="bg-secondary border-0 mt-2" />
                )}
              </div>
              <div className="space-y-2">
                <Label>Location *</Label>
                <Input value={claimLocation} onChange={(e) => setClaimLocation(e.target.value)} placeholder="Where was it lost?" className="bg-secondary border-0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date Lost *</Label>
              <Input type="date" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} className="bg-secondary border-0" required />
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea value={claimDescription} onChange={(e) => setClaimDescription(e.target.value)} placeholder="Describe the item in detail (color, brand, distinguishing marks...)" className="bg-secondary border-0 min-h-[80px]" required />
            </div>
            <div className="space-y-2">
              <Label>Upload Photo (optional)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setClaimPhoto(e.target.files?.[0] || null)}
                className="bg-secondary border-0"
              />
              {claimPhoto && (
                <p className="text-xs text-muted-foreground">Selected: {claimPhoto.name}</p>
              )}
            </div>
            <Button onClick={handleClaim} disabled={claimSubmitting || !claimName.trim() || !(claimCategory === "Other" ? claimCustomCategory : claimCategory) || !claimLocation.trim() || !claimDate || !claimDescription.trim()} className="w-full bg-primary text-primary-foreground">
              {claimSubmitting ? "Submitting..." : "Submit Claim"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Timeline Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{statusItem?.name || "Item"} - Status Timeline</DialogTitle>
            <DialogDescription>Track the journey of this item</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex flex-col gap-1">
              {statusItem && getStatusTimeline(statusItem.status).map((step, i) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step.completed ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"} ${step.current ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}>
                      {step.completed ? "✓" : i + 1}
                    </div>
                    {i < 3 && <div className={`w-0.5 h-8 ${step.completed ? "bg-primary" : "bg-secondary"}`} />}
                  </div>
                  <div className={`text-sm font-medium ${step.completed ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Image Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewItem?.name || "Item Image"}</DialogTitle>
            <DialogDescription>
              {"lost_id" in (previewItem || {}) ? "Lost Item" : "Found Item"}
            </DialogDescription>
          </DialogHeader>
          {previewItem?.image_path && (
            <div className="w-full rounded-lg overflow-hidden">
              <img
                src={previewItem.image_path}
                alt={previewItem.name || "Item image"}
                className="w-full max-h-[60vh] object-contain rounded-lg bg-secondary"
              />
            </div>
          )}
          {/* Show details only for lost items */}
          {"lost_id" in (previewItem || {}) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Category:</span>
                <span className="text-foreground font-medium">{previewItem?.category || "Unknown"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Location:</span>
                <span className="text-foreground font-medium">{previewItem?.location || "Unknown"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Date:</span>
                <span className="text-foreground font-medium">{(previewItem as LostItemRow)?.date_lost || "N/A"}</span>
              </div>
              {previewItem?.description && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Description:</span>
                  <p className="text-foreground mt-1">{previewItem.description}</p>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Status:</span>
                <Badge className={statusColors[previewItem?.status || ""] || ""}>{previewItem?.status}</Badge>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Found Item Detail Dialog (Incharge/Admin) */}
      <Dialog open={foundDetailOpen} onOpenChange={(open) => { setFoundDetailOpen(open); if (!open) setEditingFound(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFound ? "Edit Found Item" : (foundDetailItem?.name || "Found Item Details")}</DialogTitle>
            <DialogDescription>
              {editingFound ? "Update the item details below" : "Full details of the found item"}
            </DialogDescription>
          </DialogHeader>
          {foundDetailItem && !editingFound && (
            <div className="space-y-4">
              {foundDetailItem.image_path && (
                <div className="w-full rounded-lg overflow-hidden">
                  <img src={foundDetailItem.image_path} alt={foundDetailItem.name || "Found item"} className="w-full max-h-[40vh] object-contain rounded-lg bg-secondary" />
                </div>
              )}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Name:</span>
                  <span className="text-foreground font-medium">{foundDetailItem.name || "Unknown"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Category:</span>
                  <span className="text-foreground font-medium">{foundDetailItem.category || "Unknown"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Location:</span>
                  <span className="text-foreground font-medium">{foundDetailItem.location || "Unknown"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Date Found:</span>
                  <span className="text-foreground font-medium">{foundDetailItem.date_found || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={statusColors[foundDetailItem.status] || ""}>{foundDetailItem.status}</Badge>
                </div>
                {foundDetailItem.description && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Description:</span>
                    <p className="text-foreground mt-1">{foundDetailItem.description}</p>
                  </div>
                )}
              </div>
              <Button onClick={openEditMode} className="w-full gap-2">
                <Pencil className="w-4 h-4" /> Edit Item Details
              </Button>
            </div>
          )}
          {foundDetailItem && editingFound && (
            <div className="space-y-4">
              {foundDetailItem.image_path && (
                <div className="w-full rounded-lg overflow-hidden">
                  <img src={foundDetailItem.image_path} alt={foundDetailItem.name || "Found item"} className="w-full max-h-[30vh] object-contain rounded-lg bg-secondary" />
                </div>
              )}
              <div className="space-y-2">
                <Label>Item Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-secondary border-0" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="bg-secondary border-0"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="bg-secondary border-0" />
              </div>
              <div className="space-y-2">
                <Label>Date Found</Label>
                <Input type="date" value={editDateFound} onChange={(e) => setEditDateFound(e.target.value)} className="bg-secondary border-0" max={new Date().toISOString().split("T")[0]} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="bg-secondary border-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Found">Found</SelectItem>
                    <SelectItem value="Matched">Matched</SelectItem>
                    <SelectItem value="Returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="bg-secondary border-0 min-h-[80px]" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingFound(false)} className="flex-1">Cancel</Button>
                <Button onClick={handleEditFoundItem} disabled={editSubmitting} className="flex-1">
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
};

export default BrowseItems;
