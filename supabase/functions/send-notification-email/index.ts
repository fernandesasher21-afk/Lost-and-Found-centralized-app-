import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, message, type, itemName } = await req.json();

    if (!userId || !message || !type) {
      throw new Error("userId, message, and type are required");
    }

    // Get user details
    const { data: user, error: userError } = await supabase
      .from("User")
      .select("email, name")
      .eq("id", userId)
      .single();

    if (!user || !user.email) {
      console.log("User not found or no email:", userId);
      return new Response(
        JSON.stringify({ success: false, message: "User not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare email content based on type
    let subject = "";
    let emailContent = "";

    switch (type) {
      case "claim_update":
        subject = "Your Claim Status Update - UniFound";
        emailContent = `
          <h2 style="color: #333;">Claim Status Update</h2>
          <p style="color: #666;">Hi${user.name ? ` ${user.name}` : ""},</p>
          <p style="color: #666;">${message}</p>
          <p style="color: #666;">Please log in to your account for more details.</p>
        `;
        break;

      case "admin_message":
        subject = "New Message from UniFound Staff";
        emailContent = `
          <h2 style="color: #333;">New Message</h2>
          <p style="color: #666;">Hi${user.name ? ` ${user.name}` : ""},</p>
          <p style="color: #666;">You have received a message from the UniFound staff:</p>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #4F46E5;">
            <p style="color: #333; margin: 0;">${message}</p>
          </div>
          <p style="color: #666;">Please log in to your account to respond or view more details.</p>
        `;
        break;

      default:
        subject = "UniFound Notification";
        emailContent = `
          <h2 style="color: #333;">Notification</h2>
          <p style="color: #666;">${message}</p>
        `;
    }

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "UniFound <unifoundstac@gmail.com>", // Update with your verified sender
        to: user.email,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
            ${emailContent}
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              UniFound - Lost & Found Platform<br>
              <a href="${supabaseUrl.replace('.supabase.co', '')}" style="color: #4F46E5;">Visit Dashboard</a>
            </p>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const err = await emailResponse.text();
      console.error("Resend error:", emailResponse.status, err);
      throw new Error("Failed to send email");
    }

    console.log("Notification email sent to:", user.email);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-notification-email error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});