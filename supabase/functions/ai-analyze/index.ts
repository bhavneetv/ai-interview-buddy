import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { resumeText, type, transcript, questionContext, skills, name } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "analyze_resume") {
      systemPrompt = "You are an expert resume analyst. Analyze the resume and return a JSON object with: score (0-100), skills_strength (0-100), technical_depth (0-100), project_impact (0-100), ats_optimization (0-100), improvements (array of string tips, max 5), self_introduction (a 3-4 sentence professional introduction based on the resume). Return ONLY valid JSON, no markdown.";
      userPrompt = `Analyze this resume:\n\n${resumeText}`;
    } else if (type === "generate_questions") {
      systemPrompt = "You are an interview coach. Generate interview questions based on the candidate's resume. Return a JSON object with: questions (array of objects with 'text' and 'type' fields). Type can be 'hr', 'technical', or 'project'. Generate exactly 5 questions: 2 HR, 2 technical based on skills, 1 project-based. Return ONLY valid JSON, no markdown.";
      userPrompt = `Resume skills: ${skills}\nCandidate name: ${name}\n\nGenerate personalized interview questions.`;
    } else if (type === "evaluate_answer") {
      systemPrompt = "You are an interview evaluator. Analyze the candidate's answer and return a JSON object with: score (0-10), confidence_level (high/medium/low), clarity (high/medium/low), technical_depth (high/medium/low), communication_quality (high/medium/low), sentiment (confident/neutral/nervous/unsure), filler_words (array of detected filler words like 'um', 'uh', 'like', 'basically'), feedback (a 2-3 sentence improvement tip). Return ONLY valid JSON, no markdown.";
      userPrompt = `Question: ${questionContext}\nAnswer transcript: ${transcript}`;
    } else if (type === "final_summary") {
      systemPrompt = "You are an interview coach giving final feedback. Return a JSON object with: overall_score (0-100), confidence_score (0-100), communication_score (0-100), technical_score (0-100), resume_match_score (0-100), improvement_tips (array of 5 personalized string tips), final_feedback (a 3-4 sentence summary and motivational closing). Return ONLY valid JSON, no markdown.";
      userPrompt = `Interview transcript and scores:\n${transcript}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI request failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response, handling possible markdown code blocks
    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { error: "Failed to parse AI response", raw: content };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
