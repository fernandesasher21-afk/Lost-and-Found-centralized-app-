import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Validation Schema
const RequestSchema = z.object({
  userId: z.string().uuid(),
  message: z.string().min(1).max(2000),
  type: z.enum(["claim_update", "admin_message", "match"]),
  itemName: z.string().max(200).optional().nullable(),
}).strict();

// Security: Strict HTML rejection regex
const HTML_REGEX = /<[^>]*>/;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SMTP_HOST = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
    const SMTP_PORT = parseInt(Deno.env.get("SMTP_PORT") || "465");
    const SMTP_USER = Deno.env.get("SMTP_USER");
    const SMTP_PASS = Deno.env.get("SMTP_PASS");
    const SMTP_FROM_NAME = Deno.env.get("SMTP_FROM_NAME") || "UniFound";

    if (!SMTP_USER || !SMTP_PASS) {
      throw new Error("SMTP credentials not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verify Authentication & Authorization (Admin Only)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403, headers: corsHeaders });
    }

    // 2. Rate Limiting Check
    const { data: isAllowed } = await supabase.rpc("check_rate_limit", {
      _key: user.id,
      _endpoint: "send-notification-email",
      _limit: 10, // Max 10 emails per minute even for admins
      _window_interval: "1 minute"
    });

    if (isAllowed === false) {
      return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: corsHeaders });
    }

    // 3. Input Validation
    const body = await req.json();
    const result = RequestSchema.safeParse(body);
    if (!result.success) {
      return new Response(JSON.stringify({ error: "Invalid input", details: result.error.format() }), { status: 400, headers: corsHeaders });
    }
    const { userId, message, type, itemName } = result.data;

    // Security: Strict HTML Rejection in the message
    if (HTML_REGEX.test(message)) {
      return new Response(JSON.stringify({ error: "HTML tags are not allowed in message body" }), { status: 400, headers: corsHeaders });
    }

    // Get user details (recipient)
    const { data: recipient, error: userError } = await supabase
      .from("User")
      .select("email, name")
      .eq("id", userId)
      .single();

    if (!recipient || !recipient.email) {
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
          <p style="color: #666;">Hi${recipient.name ? ` ${recipient.name}` : ""},</p>
          <p style="color: #666;">${message}</p>
          <p style="color: #666;">Please log in to your account for more details.</p>
        `;
        break;

      case "admin_message":
        subject = "New Message from UniFound Staff";
        emailContent = `
          <h2 style="color: #333;">New Message</h2>
          <p style="color: #666;">Hi${recipient.name ? ` ${recipient.name}` : ""},</p>
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

    // Send email via SMTP
    const client = new SmtpClient();
    
    await client.connectTLS({
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      username: SMTP_USER,
      password: SMTP_PASS,
    });

    await client.send({
      from: `${SMTP_FROM_NAME} <${SMTP_USER}>`,
      to: recipient.email,
      subject,
      content: message, // Plain text fallback
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
    });

    await client.close();

    console.log("Notification email sent to:", recipient.email);

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