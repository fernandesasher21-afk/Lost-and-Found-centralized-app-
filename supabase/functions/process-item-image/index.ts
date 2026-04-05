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

    const { image_base64, item_type, item_id, category, subcategory, location, date_value } = await req.json();

    if (!image_base64 || !item_type || !item_id) {
      throw new Error("Missing required fields: image_base64, item_type, item_id");
    }

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

    if (!visionRes.ok) {
      const err = await visionRes.text();
      console.error("Lovable AI Vision error:", visionRes.status, err);
      if (visionRes.status === 429) throw new Error("Rate limited, please try again later");
      if (visionRes.status === 402) throw new Error("AI credits exhausted, please add funds");
      throw new Error(`Vision API failed: ${visionRes.status}`);
    }

    const visionData = await visionRes.json();
    const imageDescription = visionData.choices?.[0]?.message?.content || "";
    console.log("AI description:", imageDescription.substring(0, 100));

    // Step 2: Generate CLIP-style text embedding from the AI description using OpenAI
    console.log("Generating embedding from AI description...");
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

    if (!embeddingRes.ok) {
      const embErr = await embeddingRes.text();
      console.error("OpenAI embedding error:", embeddingRes.status, embErr);
      throw new Error(`Embedding API failed: ${embeddingRes.status}`);
    }

    const embeddingData = await embeddingRes.json();
    const embedding = embeddingData.data?.[0]?.embedding;
    if (!embedding) throw new Error("No embedding returned from OpenAI");
    console.log("Embedding generated, dimensions:", embedding.length);

    // Step 3: Store AI description + embedding on the item
    const table = item_type === "lost" ? "Lost_Item" : "Found_Item";
    const idCol = item_type === "lost" ? "lost_id" : "found_id";
    const embeddingCol = item_type === "lost" ? "lost_embedding" : "found_embedding";

    // Format embedding as pgvector string
    const embeddingStr = `[${embedding.join(",")}]`;

    const { error: updateError } = await supabase
      .from(table)
      .update({
        ai_description: imageDescription,
        subcategory: subcategory || null,
        [embeddingCol]: embeddingStr,
      })
      .eq(idCol, item_id);

    if (updateError) {
      console.error("Update error:", updateError);
      throw new Error(`Failed to store AI description/embedding: ${updateError.message}`);
    }
    console.log("AI description + embedding stored for", table, item_id);

    // Step 4: Find potential matches using AI comparison
    const oppositeTable = item_type === "lost" ? "Found_Item" : "Lost_Item";
    const oppositeStatus = item_type === "lost" ? "Found" : "Lost";

    const { data: candidates } = await supabase
      .from(oppositeTable)
      .select("*")
      .eq("status", oppositeStatus)
      .limit(20);

    const scoredMatches: any[] = [];

    if (candidates && candidates.length > 0) {
      const itemSummary = `Category: ${category || "unknown"}, Subcategory: ${subcategory || "unknown"}, Location: ${location || "unknown"}, Date: ${date_value || "unknown"}, AI Description: ${imageDescription}`;

      const candidateDescriptions = candidates
        .map((c: any, i: number) => {
          const id = item_type === "lost" ? c.found_id : c.lost_id;
          const desc = c.ai_description || c.description || "No description";
          const dateField = item_type === "lost" ? c.date_found : c.date_lost;
          return `Item ${i}: id=${id}, category=${c.category || "?"}, subcategory=${c.subcategory || "?"}, location=${c.location || "?"}, date=${dateField || "?"}, description=${desc}`;
        })
        .join("\n");

      console.log("Comparing against", candidates.length, "candidates via AI...");

      const matchRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                "You are a matching engine for a lost and found system. Compare the reference item against each candidate and return similarity scores. Consider: visual description similarity, category/subcategory match, location proximity, and date proximity. Return ONLY valid JSON.",
            },
            {
              role: "user",
              content: `Reference item:\n${itemSummary}\n\nCandidates:\n${candidateDescriptions}\n\nReturn a JSON array of objects with "index" (number) and "score" (0.0 to 1.0) for candidates with score >= 0.4. Only include matches above threshold.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_matches",
                description: "Report similarity scores for matching items",
                parameters: {
                  type: "object",
                  properties: {
                    matches: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          index: { type: "number", description: "Candidate index" },
                          score: { type: "number", description: "Similarity score 0-1" },
                          reason: { type: "string", description: "Brief reason for the score" },
                        },
                        required: ["index", "score", "reason"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["matches"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "report_matches" } },
        }),
      });

      if (matchRes.ok) {
        const matchData = await matchRes.json();
        const toolCall = matchData.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall) {
          try {
            const parsed = JSON.parse(toolCall.function.arguments);
            const aiMatches = parsed.matches || [];

            for (const m of aiMatches) {
              const candidate = candidates[m.index];
              if (!candidate || m.score < 0.4) continue;

              const candidateId = item_type === "lost" ? candidate.found_id : candidate.lost_id;

              let finalScore = m.score;
              if (candidate.subcategory && subcategory && candidate.subcategory.toLowerCase() === subcategory.toLowerCase()) {
                finalScore = Math.min(1.0, finalScore + 0.1);
              }
              if (candidate.location && location) {
                const cLoc = candidate.location.toLowerCase();
                const iLoc = location.toLowerCase();
                if (cLoc.includes(iLoc) || iLoc.includes(cLoc)) {
                  finalScore = Math.min(1.0, finalScore + 0.05);
                }
              }

              scoredMatches.push({
                ...(item_type === "lost"
                  ? { found_id: candidateId }
                  : { lost_id: candidateId, user_id: candidate.user_id }),
                name: candidate.name,
                category: candidate.category,
                subcategory: candidate.subcategory,
                location: candidate.location,
                description: candidate.description,
                similarity: finalScore,
                ai_reason: m.reason,
              });
            }
          } catch (parseErr) {
            console.error("Failed to parse AI match results:", parseErr);
          }
        }
      } else {
        console.error("AI matching failed:", matchRes.status, await matchRes.text());
      }
    }

    scoredMatches.sort((a: any, b: any) => b.similarity - a.similarity);
    console.log("AI matches found:", scoredMatches.length);

    // Step 5: Create notifications for strong matches
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
        embedding_generated: !!embedding,
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
