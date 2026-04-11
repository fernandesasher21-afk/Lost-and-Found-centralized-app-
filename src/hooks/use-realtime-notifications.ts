import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export interface RealtimeNotification {
  id: string;
  message: string;
  status: string | null;
  type: string | null;
  date_sent: string | null;
  sender_id: string | null;
  user_id: string;
}

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("date_sent", { ascending: false });

    if (data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => n.status === "unread").length);
    }
    setLoading(false);
  }, [user]);

  const cleanupOldNotifications = useCallback(async () => {
    if (!user) return;
    
    // Calculate 48 hours ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);
    const threshold = twoDaysAgo.toISOString();

    try {
      await supabase
        .from("notifications")
        .delete()
        .lt("date_sent", threshold);
    } catch (error) {
      console.error("Failed to cleanup old notifications:", error);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const init = async () => {
      await cleanupOldNotifications();
      await fetchNotifications();
    };

    init();

    // Subscribe to real-time inserts for this user
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as RealtimeNotification;
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);

          // Show a toast for the new notification
          toast.info(newNotif.message, {
            duration: 5000,
            action: {
              label: "View",
              onClick: () => {
                window.location.href = "/notifications";
              },
            },
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as RealtimeNotification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n))
          );
          // Recalculate unread count
          setNotifications((prev) => {
            setUnreadCount(prev.filter((n) => n.status === "unread").length);
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ status: "read" }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: "read" } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const deleteNotification = async (id: string) => {
    const notif = notifications.find((n) => n.id === id);
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (notif?.status === "unread") {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ status: "read" })
      .eq("user_id", user.id)
      .eq("status", "unread");
    setNotifications((prev) => prev.map((n) => ({ ...n, status: "read" })));
    setUnreadCount(0);
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    deleteNotification,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
