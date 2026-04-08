import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, ArrowRight, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageTransition from "@/components/PageTransition";
import { categories } from "@/lib/mockData";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getUserFriendlyError } from "@/lib/errorMessages";

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

const ReportFound = () => {
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [customSubcategory, setCustomSubcategory] = useState("");
  const [location, setLocation] = useState("");
  const [dateFound, setDateFound] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [distinguishingMarks, setDistinguishingMarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const navigate = useNavigate();

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = category === "Other" ? customCategory : category;
    if (!itemName || !finalCategory || !location || !dateFound || !description) { toast.error("Please fill all required fields"); return; }
    setLoading(true);
    try {
      const finalSubcategory = subcategory === "Other (specify)" ? customSubcategory : subcategory;

      // Upload image to storage if exists
      let storedImagePath: string | null = null;
      if (imageFile) {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id || "anonymous";
        const fileExt = imageFile.name.split(".").pop();
        const filePath = `found/${userId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("item-images").upload(filePath, imageFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("item-images").getPublicUrl(filePath);
        storedImagePath = urlData.publicUrl;
      }

      // Build a rich description combining all detail fields
      const detailParts = [description];
      if (color) detailParts.push(`Color: ${color}`);
      if (brand) detailParts.push(`Brand: ${brand}`);
      if (distinguishingMarks) detailParts.push(`Distinguishing marks: ${distinguishingMarks}`);
      const fullDescription = detailParts.join(" | ");

      const { data: insertedItem, error } = await supabase.from("Found_Item").insert({
        name: itemName,
        category: finalCategory,
        subcategory: finalSubcategory || null,
        location,
        date_found: dateFound,
        description: fullDescription,
        status: "Found",
        image_path: storedImagePath,
      }).select("found_id").single();
      if (error) throw error;

      // If image uploaded, generate embedding via edge function
      if (imagePreview && insertedItem) {
        toast.info("Generating AI embedding for this item...");
        try {
          const response = await supabase.functions.invoke("process-item-image", {
            body: {
              image_base64: imagePreview,
              item_type: "found",
              item_id: insertedItem.found_id,
              category: finalCategory,
              subcategory: finalSubcategory || null,
              location,
              date_value: dateFound,
            },
          });
          if (response.error) {
            console.error("Embedding generation failed:", response.error);
            toast.warning("Item saved but AI embedding could not be generated");
          } else {
            toast.success("AI embedding generated successfully!");
          }
        } catch (embError) {
          console.error("Edge function call failed:", embError);
          toast.warning("Item saved but AI processing failed");
        }
      }

      toast.success("Found item reported successfully!");
      navigate("/admin");
    } catch (error: any) {
      toast.error(getUserFriendlyError(error, "report"));
    } finally {
      setLoading(false);
    }
  };

  const currentSubcategories = category && category !== "Other" ? subcategoryMap[category] || [] : [];

  return (
    <PageTransition className="min-h-screen pt-24 pb-10 px-4 relative">
      <div className="absolute inset-0 mesh-bg opacity-30" />
      <div className="container max-w-2xl relative">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", delay: 0.2, stiffness: 200 }} className="w-[72px] h-[72px] rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
            <Eye className="w-9 h-9 text-primary" />
          </motion.div>
          <h1 className="text-4xl font-display font-bold text-foreground">Report Found Item</h1>
          <p className="text-muted-foreground mt-2 text-lg">Provide detailed information to help match this item</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-strong rounded-3xl p-8 md:p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Item Name *</Label>
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Red Umbrella, Samsung Phone, Glasses..." className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Category *</Label>
                <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); if (v !== "Other") setCustomCategory(""); }}>
                  <SelectTrigger className="bg-secondary/50 border-border/30 h-11 rounded-xl"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                    <SelectItem value="Other">Other (specify)</SelectItem>
                  </SelectContent>
                </Select>
                {category === "Other" && (
                  <Input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Enter custom category..." className="bg-secondary/50 border-border/30 h-11 rounded-xl mt-2" />
                )}
              </div>
              {currentSubcategories.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Subcategory</Label>
                  <Select value={subcategory} onValueChange={(v) => { setSubcategory(v); if (v !== "Other (specify)") setCustomSubcategory(""); }}>
                    <SelectTrigger className="bg-secondary/50 border-border/30 h-11 rounded-xl"><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {currentSubcategories.map((sc) => (<SelectItem key={sc} value={sc}>{sc}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  {subcategory === "Other (specify)" && (
                    <Input value={customSubcategory} onChange={(e) => setCustomSubcategory(e.target.value)} placeholder="Enter custom subcategory..." className="bg-secondary/50 border-border/30 h-11 rounded-xl mt-2" />
                  )}
                </div>
              )}
            </div>

            {/* New detail fields */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Color</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger className="bg-secondary/50 border-border/30 h-11 rounded-xl"><SelectValue placeholder="Select color" /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {colorOptions.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Brand / Make</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Samsung, Nike, HP..." className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Distinguishing Marks</Label>
              <Input value={distinguishingMarks} onChange={(e) => setDistinguishingMarks(e.target.value)} placeholder="e.g. Scratches, stickers, engraving..." className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Location *</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where was it found?" className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Date Found *</Label>
                <Input type="date" value={dateFound} onChange={(e) => setDateFound(e.target.value)} max={new Date().toISOString().split("T")[0]} className="bg-secondary/50 border-border/30 h-11 rounded-xl" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Description *</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the found item in detail — color, shape, material, any text/logos, condition, contents (if bag/wallet)..." className="bg-secondary/50 border-border/30 min-h-[140px] rounded-xl" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Upload Image (optional)</Label>
              <label
                className="border-2 border-dashed border-border/40 rounded-2xl p-8 text-center cursor-pointer hover:border-primary/30 hover:bg-primary/3 transition-all duration-300 block group"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileChange(f); }}
              >
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileChange(f); }} />
                {imagePreview ? (
                  <div className="space-y-3">
                    <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-xl object-contain" />
                    <p className="text-sm text-muted-foreground">Click to change image</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-secondary/80 flex items-center justify-center mx-auto group-hover:bg-primary/10 transition-colors">
                      <ImageIcon className="w-7 h-7 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Click or drag to upload</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                    </div>
                  </div>
                )}
              </label>
            </div>

            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-13 rounded-xl text-base font-semibold glow gap-2">
                {loading ? "Submitting..." : <>Submit Found Item <ArrowRight className="w-4 h-4" /></>}
              </Button>
            </motion.div>
          </form>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default ReportFound;
