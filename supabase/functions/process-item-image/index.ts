import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const HUGGINGFACE_API_KEY = Deno.env.get("HUGGINGFACE_API_KEY");
    if (!HUGGINGFACE_API_KEY) throw new Error("HUGGINGFACE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { image_base64, item_type, item_id, category, subcategory, location, date_value, original_description } = await req.json();

    if (!image_base64 || !item_type || !item_id) {
      throw new Error("Missing required fields: image_base64, item_type, item_id");
    }

    const isImageUpload = image_base64 && image_base64.length > 100;
    let clipEmbeddingStr = null;
    let textEmbeddingStr = null;
    let imageDescription = original_description || "";

    if (isImageUpload) {
      // Step 1: Use Lovable AI (Gemini with vision) to describe the image
      console.log("Generating image description via Lovable AI...");
      const imageUrl = image_base64.startsWith("data:") ? image_base64 : `data:image/jpeg;base64,${image_base64}`;

      const visionRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are an expert at describing objects for a lost and found system. Describe the item in the image in detail: color, brand, size, shape, material, distinctive marks, condition. Be specific and factual. Keep it under 200 words.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this item in detail for matching purposes:" },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
        }),
      });

      if (visionRes.ok) {
        const visionData = await visionRes.json();
        const generatedDesc = visionData.choices?.[0]?.message?.content || "";
        if (generatedDesc) {
           imageDescription = `${original_description ? original_description + ' | ' : ''} AI Vision: ${generatedDesc}`;
        }
        console.log("AI description:", imageDescription.substring(0, 100));
      }

      // Step 2: Generate CLIP Visual Embedding from HuggingFace
      console.log("Generating CLIP visual embedding via HF...");
      try {
        const cleanBase64 = image_base64.includes(",") ? image_base64.split(",")[1] : image_base64;
        const binString = atob(cleanBase64);
        const len = binString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binString.charCodeAt(i);
        }

        const hfRes = await fetch("https://api-inference.huggingface.co/pipeline/feature-extraction/openai/clip-vit-base-patch32", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
            "Content-Type": "application/octet-stream"
          },
          body: bytes
        });

        if (!hfRes.ok) throw new Error(`HF API failed: ${hfRes.status}`);
        let clipData = await hfRes.json();
        // HF usually returns an array of numbers, or nested. Flat it.
        if (Array.isArray(clipData)) {
           const flatData = clipData.flat(Infinity);
           if (flatData.length === 512) {
             clipEmbeddingStr = `[${flatData.join(",")}]`;
             console.log("CLIP embedding successfully generated! Dimensions: 512");
           } else {
             console.log("Warning: CLIP returned wrong dimensions:", flatData.length);
           }
        }
      } catch (hfErr) {
        console.error("Failed HF CLIP embedding:", hfErr);
      }
    }

    // Step 3: Generate Text Embedding from OpenAI (for text fallback matching)
    console.log("Generating text embedding from OpenAI...");
    try {
      const embeddingText = `${category || ""} ${subcategory || ""} ${imageDescription}`.trim();
      
      const embeddingRes = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: embeddingText,
        }),
      });

      if (embeddingRes.ok) {
        const embeddingData = await embeddingRes.json();
        const textEmbeddingArray = embeddingData.data?.[0]?.embedding;
        if (textEmbeddingArray && textEmbeddingArray.length === 1536) {
           textEmbeddingStr = `[${textEmbeddingArray.join(",")}]`;
           console.log("Text embedding successfully generated! Dimensions: 1536");
        }
      }
    } catch (openaiErr) {
       console.error("Failed OpenAI text embedding:", openaiErr);
    }

    // Step 4: Store Embeddings on the item
    const table = item_type === "lost" ? "Lost_Item" : "Found_Item";
    const idCol = item_type === "lost" ? "lost_id" : "found_id";
    const clipCol = item_type === "lost" ? "lost_embedding" : "found_embedding";

    const updatePayload: any = {
      ai_description: imageDescription,
      subcategory: subcategory || null,
    };
    if (clipEmbeddingStr) updatePayload[clipCol] = clipEmbeddingStr;
    if (textEmbeddingStr) updatePayload["text_embedding"] = textEmbeddingStr;

    const { error: updateError } = await supabase
      .from(table)
      .update(updatePayload)
      .eq(idCol, item_id);

    if (updateError) {
      throw new Error(`Failed to store AI description/embedding: ${updateError.message}`);
    }
    console.log("AI description + embeddings stored for", table, item_id);

    // Step 5: Find potential matches using pgvector RPC
    // Date filter: only match items where the date is within 1 day tolerance
    // For found items: match with lost items where date_lost <= date_found + 1 day
    // For lost items: match with found items where date_found >= date_lost - 1 day
    let scoredMatches: any[] = [];
    const parsedDate = date_value ? new Date(date_value) : null;

    // Primary: Image Match (> 80%)
    if (clipEmbeddingStr) {
       const rpcName = item_type === "lost" ? "match_lost_to_found" : "match_found_to_lost";
       const { data: embeddingMatches } = await supabase.rpc(rpcName, {
        _embedding: clipEmbeddingStr,
        _subcategory: subcategory || "",
        _date_found: parsedDate && item_type === "found" ? parsedDate.toISOString().split('T')[0] : null,
        _date_lost: parsedDate && item_type === "lost" ? parsedDate.toISOString().split('T')[0] : null,
        _limit: 10,
       });

       if (embeddingMatches) {
         for (const m of embeddingMatches) {
           if (m.similarity >= 0.80) {
             scoredMatches.push({...m, matchType: 'photo'});
           }
         }
       }
    }

    // Fallback: Text Match (> 40%) - Rule Check: Only for found items
    // "If a student reports a lost item -> show them matching found item (if and only if student has uploaded an image don't do text matching...)"
    if (scoredMatches.length === 0 && item_type === "found" && textEmbeddingStr) {
       const { data: textMatches } = await supabase.rpc("match_found_to_lost_text", {
        _embedding: textEmbeddingStr,
        _subcategory: subcategory || "",
        _date_found: parsedDate ? parsedDate.toISOString().split('T')[0] : null,
        _limit: 10,
       });

       if (textMatches) {
         for (const m of textMatches) {
           if (m.similarity >= 0.40) {
             scoredMatches.push({...m, matchType: 'text'});
           }
         }
       }
    }

    scoredMatches.sort((a: any, b: any) => b.similarity - a.similarity);
    console.log("AI matches found:", scoredMatches.length);

    // Step 6: Create notifications for strong matches
    if (scoredMatches.length > 0 && item_type === "found") {
      for (const match of scoredMatches) {
        if (match.similarity > 0.65 && match.user_id) {
          const pct = Math.round(match.similarity * 100);
          await supabase.from("notifications").insert({
            user_id: match.user_id,
            message: `We found a possible match (${pct}%) for your lost item: ${match.name || "Unknown item"}. Check your dashboard for details.`,
            type: "match",
            status: "unread",
          });
          console.log("Notification sent to user:", match.user_id);
        }
      }
    } else if (scoredMatches.length > 0 && item_type === "lost") {
      if (user) {
        const bestMatch = scoredMatches[0];
        const pct = Math.round(bestMatch.similarity * 100);
        await supabase.from("notifications").insert({
          user_id: user.id,
          message: `We found a possible match (${pct}%) with a found item: ${bestMatch.name || "Unknown item"}. Check your dashboard!`,
          type: "match",
          status: "unread",
          sender_id: user.id,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        matches: scoredMatches,
        description: imageDescription,
        embedding_generated: !!clipEmbeddingStr || !!textEmbeddingStr,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("process-item-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
