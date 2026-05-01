import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Package, Eye, MapPin, Calendar, Pencil, CheckCircle, ImageIcon, User, Undo2 } from "lucide-react";
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
import { ReportItemSchema } from "@/lib/validations";

const subcategoryMap: Record<string, string[]> = {
  Electronics: ["Phone", "Laptop", "Charger", "Earbuds", "Tablet", "Smartwatch", "Camera", "Other (specify)"],
  "ID Cards": ["University ID", "Library Card", "Bus Pass", "Driving License", "Other (specify)"],
  Books: ["Textbook", "Notebook", "Novel", "Reference Book", "Other (specify)"],
  Wallets: ["Leather Wallet", "Card Holder", "Purse", "Money Clip", "Other (specify)"],
  Keys: ["Room Key", "Vehicle Key", "Locker Key", "Key Chain Set", "Other (specify)"],
  Clothing: ["Jacket", "Hoodie", "Cap", "Scarf", "Shoes", "Other (specify)"],
  Accessories: ["Bag", "Backpack", "Umbrella", "Water Bottle", "Glasses", "Watch", "Other (specify)"],
};

const colorOptions = ["Black", "White", "Red", "Blue", "Green", "Yellow", "Brown", "Grey", "Pink", "Orange", "Purple", "Gold", "Silver", "Multi-color", "Other"];

// Text-based matching for auto-verification
function calculateTextMatchScore(lostItem: any, foundItem: any): number {
  let score = 0;
  // Category match (30%)
  if (lostItem.category && foundItem.category && lostItem.category.toLowerCase() === foundItem.category.toLowerCase()) score += 0.30;
  
  // Subcategory match (25%)
  if (lostItem.subcategory && foundItem.subcategory && lostItem.subcategory.toLowerCase() === foundItem.subcategory.toLowerCase()) score += 0.25;
  
  // Location match (25%)
  if (lostItem.location && foundItem.location) {
    const ll = lostItem.location.toLowerCase(), fl = foundItem.location.toLowerCase();
    if (ll === fl) score += 0.25;
    else if (ll.includes(fl) || fl.includes(ll)) score += 0.15;
  }
  
  // Description match (10%) - Reduced weight
  if (lostItem.description && foundItem.description) {
    const lw = new Set(lostItem.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
    const fw = new Set(foundItem.description.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
    const inter = [...lw].filter(w => fw.has(w));
    const union = new Set([...lw, ...fw]);
    if (union.size > 0) score += 0.10 * (inter.length / union.size);
  }
  
  // Name match (5%)
  if (lostItem.name && foundItem.name && (lostItem.name.toLowerCase().includes(foundItem.name.toLowerCase()) || foundItem.name.toLowerCase().includes(lostItem.name.toLowerCase()))) score += 0.05;
  
  // Date match (5%)
  if (lostItem.date_lost && foundItem.date_found) {
    const diff = Math.abs(new Date(lostItem.date_lost).getTime() - new Date(foundItem.date_found).getTime()) / (1000 * 60 * 60 * 24);
    if (diff <= 1) score += 0.05;
    else if (diff <= 3) score += 0.03;
    else if (diff <= 7) score += 0.01;
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
  user_id: string | null;
  reporter_name?: string | null;
  reporter_email?: string | null;
  reporter_pid?: string | null;
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
  user_id?: string | null;
  reporter_name?: string | null;
  reporter_email?: string | null;
  reporter_pid?: string | null;
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
  const [claimSubcategory, setClaimSubcategory] = useState("");
  const [claimCustomSubcategory, setClaimCustomSubcategory] = useState("");
  const [claimLocation, setClaimLocation] = useState("");
  const [claimDate, setClaimDate] = useState("");
  const [claimDescription, setClaimDescription] = useState("");
  const [claimColor, setClaimColor] = useState("");
  const [claimBrand, setClaimBrand] = useState("");
  const [claimDistinguishingMarks, setClaimDistinguishingMarks] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimPhoto, setClaimPhoto] = useState<File | null>(null);
  const [claimPhotoPreview, setClaimPhotoPreview] = useState<string | null>(null);
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

      let lostItemsMap = (lostRes.data as any[]) || [];
      let foundItemsMap = (foundRes.data as any[]) || [];

      if (isStaffOrAdmin) {
        // Fetch reporter details for admins
        const userIds = [
          ...new Set([
            ...lostItemsMap.filter((i: any) => i.user_id).map((i: any) => i.user_id!),
            ...foundItemsMap.filter((i: any) => i.user_id).map((i: any) => i.user_id!),
          ]),
        ];

        if (userIds.length > 0) {
          const { data: usersData } = await supabase
            .from("User")
            .select("id, name, email, pid")
            .in("id", userIds);

          if (usersData) {
            const userLookup = Object.fromEntries(
              usersData.map((u) => [u.id, { name: u.name, email: u.email, pid: (u as any).pid }])
            );

            lostItemsMap = lostItemsMap.map((item: any) => ({
              ...item,
              reporter_name: item.user_id ? (userLookup[item.user_id]?.name || "Unknown") : null,
              reporter_email: item.user_id ? (userLookup[item.user_id]?.email || null) : null,
              reporter_pid: item.user_id ? (userLookup[item.user_id]?.pid || null) : null,
            })) as any[];

            foundItemsMap = foundItemsMap.map((item: any) => ({
              ...item,
              reporter_name: item.user_id ? (userLookup[item.user_id]?.name || "Unknown") : null,
              reporter_email: item.user_id ? (userLookup[item.user_id]?.email || null) : null,
              reporter_pid: item.user_id ? (userLookup[item.user_id]?.pid || null) : null,
            })) as any[];
          }
        }
      }

      // Sort: active items first, then recovered (Returned) items at the end
      const activeLost = lostItemsMap.filter(l => l.status !== "Returned");
      const recoveredLost = lostItemsMap.filter(l => l.status === "Returned");
      setLostItems([...activeLost, ...recoveredLost]);

      const activeFound = foundItemsMap.filter(f => f.status !== "Returned");
      const recoveredFound = foundItemsMap.filter(f => f.status === "Returned");
      setFoundItems([...activeFound, ...recoveredFound]);

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
  }, [user, isStaffOrAdmin]);

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
    const finalClaimSubcategory = claimSubcategory === "Other (specify)" ? claimCustomSubcategory : claimSubcategory;

    // Validation via Zod
    const validationResult = ReportItemSchema.safeParse({
      name: claimName,
      category: finalClaimCategory,
      subcategory: finalClaimSubcategory || null,
      location: claimLocation,
      date: claimDate,
      description: claimDescription,
      color: claimColor || null,
      brand: claimBrand || null,
      marks: claimDistinguishingMarks || null,
    });

    if (!validationResult.success) {
      toast.error(validationResult.error.errors[0].message);
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

    // Build detailed description with all fields
    const detailParts = [`Description: ${claimDescription}`];
    if (claimColor) detailParts.push(`Color: ${claimColor}`);
    if (claimBrand) detailParts.push(`Brand: ${claimBrand}`);
    if (claimDistinguishingMarks) detailParts.push(`Marks: ${claimDistinguishingMarks}`);

    let photoBase64: string | null = null;
    if (claimPhoto) {
      const reader = new FileReader();
      photoBase64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(claimPhoto);
      });
    }

    const details = [
      `Description: ${claimDescription}`,
      `Name: ${claimName}`,
      `Category: ${finalClaimCategory}${finalClaimSubcategory ? ` - ${finalClaimSubcategory}` : ""}`,
      `Location: ${claimLocation}`,
      `Date Lost: ${claimDate}`,
      claimColor && `Color: ${claimColor}`,
      claimBrand && `Brand: ${claimBrand}`,
      claimDistinguishingMarks && `Marks: ${claimDistinguishingMarks}`,
      photoBase64 && `Photo: [Uploaded]`,
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

              // Send notification to student via Edge Function (for email)
              try {
                await supabase.functions.invoke("send-notification-email", {
                  body: {
                    userId: user.id,
                    message: `Congratulations! Your ownership claim for "${claimItem.name || "item"}" was automatically verified with a ${Math.round(bestMatch * 100)}% match. Please visit the lost and found desk to collect it at your earliest convenience.`,
                    type: "claim_update",
                    itemName: claimItem.name
                  }
                });
              } catch (emailErr) {
                console.error("Failed to send auto-approval email:", emailErr);
              }

              // Send in-app notification
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
    setClaimSubcategory("");
    setClaimCustomSubcategory("");
    setClaimLocation("");
    setClaimDate("");
    setClaimDescription("");
    setClaimColor("");
    setClaimBrand("");
    setClaimDistinguishingMarks("");
    setClaimPhoto(null);
    setClaimPhotoPreview(null);
  };

  const handleClaimPhotoChange = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setClaimPhoto(file);
    const reader = new FileReader();
    reader.onload = (e) => setClaimPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const currentClaimSubcategories = claimCategory && claimCategory !== "Other" ? subcategoryMap[claimCategory] || [] : [];

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
                        if (foundItem.status === "Returned") {
                          // Do nothing for recovered items - no action should happen
                          return;
                        }
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
                            {isStaffOrAdmin && (item as LostItemRow).reporter_name && (
                              <div className="pt-2 border-t border-border/20 mt-2 space-y-1">
                                <div className="flex items-center gap-1.5 text-[10px] text-foreground font-medium">
                                  <User className="w-2.5 h-2.5" /> {(item as LostItemRow).reporter_name}
                                </div>
                                <div className="flex flex-wrap gap-x-2 text-[9px] text-muted-foreground pl-4">
                                  {(item as LostItemRow).reporter_pid && <span>PID: {(item as LostItemRow).reporter_pid}</span>}
                                  {(item as LostItemRow).reporter_email && <span>{(item as LostItemRow).reporter_email}</span>}
                                </div>
                              </div>
                            )}
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
                            <Badge className={`ml-2 text-xs ${statusColors[item.status || ""] || ""}`}>
                              {item.status === "Returned" ? "Returned to Owner" : item.status}
                            </Badge>
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
                          {isStaffOrAdmin && (item as FoundItemRow).reporter_name && (
                            <div className="pt-2 border-t border-border/20 mt-3 space-y-1">
                              <div className="flex items-center gap-1.5 text-[10px] text-foreground font-medium">
                                <User className="w-2.5 h-2.5" /> {(item as FoundItemRow).reporter_name}
                              </div>
                              <div className="flex flex-wrap gap-x-2 text-[9px] text-muted-foreground pl-4">
                                {(item as FoundItemRow).reporter_pid && <span>PID: {(item as FoundItemRow).reporter_pid}</span>}
                                {(item as FoundItemRow).reporter_email && <span>{(item as FoundItemRow).reporter_email}</span>}
                              </div>
                            </div>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-0 border-0 glass-strong shadow-2xl">
          <div className="p-8 md:p-10">
            <DialogHeader className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <CheckCircle className="w-7 h-7 text-primary" />
              </div>
              <DialogTitle className="text-3xl font-display font-bold">Claim Item: {claimItem?.name || "Item"}</DialogTitle>
              <DialogDescription className="text-base mt-2">
                Provide precise details about your lost item. This data is used to verify ownership and match with our records.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Item Name *</Label>
                <Input value={claimName} onChange={(e) => setClaimName(e.target.value)} placeholder="e.g. Blue Backpack, iPhone 15..." className="bg-secondary/50 border-border/30 h-11 rounded-xl" required />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Category *</Label>
                  <Select value={claimCategory} onValueChange={(v) => { setClaimCategory(v); setClaimSubcategory(""); if (v !== "Other") setClaimCustomCategory(""); }}>
                    <SelectTrigger className="bg-secondary/50 border-border/30 h-11 rounded-xl"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                      <SelectItem value="Other">Other (specify)</SelectItem>
                    </SelectContent>
                  </Select>
                  {claimCategory === "Other" && (
                    <Input value={claimCustomCategory} onChange={(e) => setClaimCustomCategory(e.target.value)} placeholder="Enter custom category..." className="bg-secondary/50 border-border/30 h-11 rounded-xl mt-2" />
                  )}
                </div>
                {currentClaimSubcategories.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Subcategory</Label>
                    <Select value={claimSubcategory} onValueChange={(v) => { setClaimSubcategory(v); if (v !== "Other (specify)") setClaimCustomSubcategory(""); }}>
                      <SelectTrigger className="bg-secondary/50 border-border/30 h-11 rounded-xl"><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {currentClaimSubcategories.map((sc) => (<SelectItem key={sc} value={sc}>{sc}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    {claimSubcategory === "Other (specify)" && (
                      <Input value={claimCustomSubcategory} onChange={(e) => setClaimCustomSubcategory(e.target.value)} placeholder="Enter custom subcategory..." className="bg-secondary/50 border-border/30 h-11 rounded-xl mt-2" />
                    )}
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Color</Label>
                  <Select value={claimColor} onValueChange={setClaimColor}>
                    <SelectTrigger className="bg-secondary/50 border-border/30 h-11 rounded-xl"><SelectValue placeholder="Select color" /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {colorOptions.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Brand / Make</Label>
                  <Input value={claimBrand} onChange={(e) => setClaimBrand(e.target.value)} placeholder="e.g. Samsung, Nike, HP..." className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Distinguishing Marks</Label>
                <Input value={claimDistinguishingMarks} onChange={(e) => setClaimDistinguishingMarks(e.target.value)} placeholder="e.g. Scratches, stickers, engraving..." className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Location *</Label>
                  <Input value={claimLocation} onChange={(e) => setClaimLocation(e.target.value)} placeholder="Where was it lost?" className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Date Lost *</Label>
                  <Input type="date" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} max={new Date().toISOString().split("T")[0]} className="bg-secondary/50 border-border/30 h-11 rounded-xl" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Description *</Label>
                <Textarea value={claimDescription} onChange={(e) => setClaimDescription(e.target.value)} placeholder="Provide any other details that can help verify this item is yours..." className="bg-secondary/50 border-border/30 min-h-[120px] rounded-xl" required />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Upload Reference Photo (optional)</Label>
                <label
                  className="border-2 border-dashed border-border/40 rounded-2xl p-6 text-center cursor-pointer hover:border-primary/30 hover:bg-primary/3 transition-all duration-300 block group"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleClaimPhotoChange(f); }}
                >
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleClaimPhotoChange(f); }} />
                  {claimPhotoPreview ? (
                    <div className="space-y-3">
                      <img src={claimPhotoPreview} alt="Preview" className="max-h-40 mx-auto rounded-xl object-contain shadow-md" />
                      <p className="text-xs text-muted-foreground">Click to change photo</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-secondary/80 flex items-center justify-center mx-auto group-hover:bg-primary/10 transition-colors">
                        <ImageIcon className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">Click or drag to upload a photo of your item</p>
                        <p className="text-[10px] text-muted-foreground mt-1">For verification only — max 5MB</p>
                      </div>
                    </div>
                  )}
                </label>
              </div>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="pt-2">
                <Button onClick={handleClaim} disabled={claimSubmitting || !claimName.trim() || !(claimCategory === "Other" ? claimCustomCategory : claimCategory) || !claimLocation.trim() || !claimDate || !claimDescription.trim()} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-xl text-base font-semibold glow gap-2 shadow-lg">
                  {claimSubmitting ? "Submitting Claim..." : "Submit Verification Details"}
                </Button>
              </motion.div>
            </div>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border/50">
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
                  <Badge className={statusColors[foundDetailItem.status] || ""}>
                    {foundDetailItem.status === "Returned" ? "Returned to Owner" : foundDetailItem.status}
                  </Badge>
                </div>
                {foundDetailItem.description && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Description:</span>
                    <p className="text-foreground mt-1">{foundDetailItem.description}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {foundDetailItem.status !== "Returned" && (
                  <Button 
                    onClick={async () => {
                      const { error } = await supabase.from("Found_Item").update({ status: "Returned" }).eq("found_id", foundDetailItem.found_id);
                      if (error) toast.error("Failed to mark as returned");
                      else {
                        toast.success("Item marked as returned");
                        setFoundItems(prev => prev.map(f => f.found_id === foundDetailItem.found_id ? { ...f, status: "Returned" } : f));
                        setFoundDetailItem({ ...foundDetailItem, status: "Returned" });
                      }
                    }} 
                    className="w-full gap-2 bg-success text-white hover:bg-success/90"
                  >
                    <CheckCircle className="w-4 h-4" /> Mark as Recovered
                  </Button>
                )}
                {foundDetailItem.status === "Returned" && (
                  <Button 
                    onClick={async () => {
                      const { error } = await supabase.from("Found_Item").update({ status: "Found" }).eq("found_id", foundDetailItem.found_id);
                      if (error) toast.error("Failed to undo recovery");
                      else {
                        toast.success("Recovery undone");
                        setFoundItems(prev => prev.map(f => f.found_id === foundDetailItem.found_id ? { ...f, status: "Found" } : f));
                        setFoundDetailItem({ ...foundDetailItem, status: "Found" });
                      }
                    }} 
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Undo2 className="w-4 h-4" /> Undo Recovery
                  </Button>
                )}
                <Button onClick={openEditMode} variant="secondary" className="w-full gap-2">
                  <Pencil className="w-4 h-4" /> Edit Item Details
                </Button>
              </div>
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
