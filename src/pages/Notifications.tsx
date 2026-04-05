import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, CheckCircle, CheckCheck, MessageSquare, Search, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";

const Notifications = () => {
  const { user, isStaffOrAdmin } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markAsRead, deleteNotification, markAllAsRead } = useRealtimeNotifications();
  const [senderMap, setSenderMap] = useState<Record<string, string>>({});

  // Resolve sender names
  useEffect(() => {
    const senderIds = [...new Set(notifications.filter(n => n.sender_id).map(n => n.sender_id!))];
    if (senderIds.length === 0) return;
    supabase.from("User").select("id, name").in("id", senderIds).then(({ data }) => {
      if (data) setSenderMap(Object.fromEntries(data.map(u => [u.id, u.name || "Admin"])));
    });
  }, [notifications]);

  const handleNotificationClick = async (notif: any) => {
    // Delete the notification from DB when clicked
    await deleteNotification(notif.id);
    if (isStaffOrAdmin && (notif.type === "claim" || notif.type === "claim_update")) {
      navigate("/admin?tab=claims");
    } else if (!isStaffOrAdmin && notif.type === "claim_update") {
      navigate("/dashboard?tab=claims");
    } else if (!isStaffOrAdmin) {
      navigate("/dashboard");
    } else {
      navigate("/admin");
    }
  };

  return (
    <PageTransition className="min-h-screen pt-20 pb-10">
      <div className="container px-4 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Link to={isStaffOrAdmin ? "/admin" : "/dashboard"}>
            <Button variant="ghost" size="sm" className="mb-4 gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Notifications</h1>
              <p className="text-muted-foreground mt-1">
                {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "All caught up!"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={markAllAsRead}>
                  <CheckCheck className="w-4 h-4" />
                  Mark all read
                </Button>
              )}
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bell className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>
        </motion.div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground text-lg">No notifications yet</p>
            <p className="text-muted-foreground/70 text-sm mt-1">You'll be notified when your lost item is matched</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif, i) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`glass rounded-xl p-5 border-l-4 cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all ${
                  notif.status === "unread" ? "border-l-primary bg-primary/5" : "border-l-transparent"
                }`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mt-0.5 ${
                      notif.type === "admin_message" ? "bg-accent/10" : "bg-primary/10"
                    }`}>
                      {notif.type === "admin_message" ? (
                        <MessageSquare className="w-4 h-4 text-accent" />
                      ) : (
                        <Search className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground leading-relaxed">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {notif.sender_id && senderMap[notif.sender_id] && (
                          <span className="text-xs text-muted-foreground">From: {senderMap[notif.sender_id]}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {notif.date_sent ? new Date(notif.date_sent).toLocaleDateString() : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {notif.status === "unread" && (
                      <Badge className="bg-primary/20 text-primary text-xs">New</Badge>
                    )}
                    {notif.status === "unread" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                        className="text-xs"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default Notifications;
