import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Camera, Save, ArrowLeft, User, Phone, CreditCard, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { getUserFriendlyError } from "@/lib/errorMessages";

const EditProfile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [pid, setPid] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("User")
        .select("name, pid, phone_number, avatar_url")
        .eq("id", user.id)
        .single();
      if (data) {
        setName(data.name || "");
        setPid(data.pid || "");
        setPhone((data as any).phone_number || "");
        setAvatarUrl((data as any).avatar_url || null);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-photos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl + `?t=${Date.now()}`;
      setAvatarUrl(publicUrl);

      await supabase
        .from("User")
        .update({ avatar_url: urlData.publicUrl } as any)
        .eq("id", user.id);

      toast.success("Profile photo updated!");
    } catch (err: any) {
      toast.error(getUserFriendlyError(err, "upload"));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (pid && pid.length !== 6) {
      toast.error("PID must be exactly 6 characters.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("User")
        .update({
          name,
          pid: pid.toUpperCase(),
          phone_number: phone || null,
        } as any)
        .eq("id", user.id);

      if (error) throw error;
      toast.success("Profile updated successfully!");
      navigate(-1);
    } catch (err: any) {
      toast.error(getUserFriendlyError(err, "profile"));
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <PageTransition>
      <div className="min-h-screen pt-24 pb-12 px-4">
        <div className="max-w-lg mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-8">
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="font-display text-2xl font-bold gradient-text">Edit Profile</h1>
            </div>

            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
              <div className="space-y-6">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <Avatar className="w-24 h-24 border-2 border-primary/30">
                      {avatarUrl ? (
                        <AvatarImage src={avatarUrl} alt="Profile" />
                      ) : null}
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                        {name ? name.charAt(0).toUpperCase() : <User className="w-8 h-8" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                  <p className="text-xs text-muted-foreground">
                    {uploading ? "Uploading..." : "Click to change photo"}
                  </p>
                </div>

                {/* Email (read-only) */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Email</Label>
                  <Input value={user.email} disabled className="opacity-60" />
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </div>

                {/* PID */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CreditCard className="w-3.5 h-3.5" /> PID</Label>
                  <Input
                    value={pid}
                    onChange={(e) => setPid(e.target.value.slice(0, 6))}
                    placeholder=""
                    maxLength={6}
                    className="uppercase"
                  />
                  <p className="text-xs text-muted-foreground">Must be exactly 6 characters</p>
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> Phone Number</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Your phone number"
                    type="tel"
                  />
                </div>

                <Button
                  className="w-full gap-2 rounded-xl h-11 font-semibold glow"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
};

export default EditProfile;
