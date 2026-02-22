import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      resumeText,
      type,
      transcript,
      questionContext,
      skills,
      name,
      audioBase64,
      mimeType,
      text,
      voiceId,
      modelId,
    } = await req.json();

    if (type === "text_to_speech") {
      const content = String(text ?? "").trim();
      if (!content) {
        return new Response(JSON.stringify({ error: "text is required for text_to_speech" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
      if (!ELEVENLABS_API_KEY) {
        return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const selectedVoiceId =
        (typeof voiceId === "string" && voiceId.trim())
        || Deno.env.get("ELEVENLABS_VOICE_ID")
        || "EXAVITQu4vr4xnSDxMaL";

      const modelCandidates = Array.from(
        new Set(
          [
            typeof modelId === "string" ? modelId.trim() : "",
            Deno.env.get("ELEVENLABS_MODEL_ID") ?? "",
            "eleven_turbo_v2_5",
            "eleven_multilingual_v2",
          ].filter(Boolean),
        ),
      );

      let lastStatus = 500;
      let lastErrorText = "Unknown ElevenLabs error";

      for (const candidateModel of modelCandidates) {
        const ttsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}?optimize_streaming_latency=2`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
              "Accept": "audio/mpeg",
            },
            body: JSON.stringify({
              text: content,
              model_id: candidateModel,
              voice_settings: {
                stability: 0.45,
                similarity_boost: 0.75,
                style: 0.2,
                use_speaker_boost: true,
              },
            }),
          },
        );

        if (ttsResponse.ok) {
          const bytes = new Uint8Array(await ttsResponse.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const encoded = btoa(binary);

          return new Response(JSON.stringify({
            provider: "elevenlabs",
            model: candidateModel,
            voiceId: selectedVoiceId,
            mimeType: "audio/mpeg",
            audioBase64: encoded,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        lastStatus = ttsResponse.status;
        lastErrorText = await ttsResponse.text();
        console.error(`ElevenLabs TTS failed for model ${candidateModel}:`, lastStatus, lastErrorText);

        if ([401, 402, 403, 429].includes(lastStatus)) {
          break;
        }
      }

      return new Response(JSON.stringify({ error: "ElevenLabs text_to_speech failed", details: lastErrorText }), {
        status: lastStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (type === "transcribe_audio") {
      if (!audioBase64 || typeof audioBase64 !== "string") {
        return new Response(JSON.stringify({ error: "audioBase64 is required for transcribe_audio" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const safeMimeType = typeof mimeType === "string" && mimeType.trim() ? mimeType : "audio/webm";
      const extension = safeMimeType.includes("mp4")
        ? "mp4"
        : safeMimeType.includes("mpeg") || safeMimeType.includes("mp3")
          ? "mp3"
          : safeMimeType.includes("wav")
            ? "wav"
            : "webm";

      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const models = ["gpt-4o-mini-transcribe", "whisper-1"];
      let lastErrorText = "Unknown transcription error";
      let lastStatus = 500;

      for (const model of models) {
        const formData = new FormData();
        formData.append("model", model);
        formData.append("language", "en");
        formData.append("response_format", "json");
        formData.append(
          "file",
          new Blob([bytes], { type: safeMimeType }),
          `answer.${extension}`,
        );

        const sttResponse = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
          },
          body: formData,
        });

        if (sttResponse.ok) {
          const sttData = await sttResponse.json();
          const sttText = String(sttData?.text ?? sttData?.transcript ?? "").trim();
          return new Response(JSON.stringify({ transcript: sttText }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        lastStatus = sttResponse.status;
        lastErrorText = await sttResponse.text();
        console.error(`Transcription attempt failed for model ${model}:`, lastStatus, lastErrorText);
      }

      return new Response(JSON.stringify({ error: "Audio transcription failed", details: lastErrorText }), {
        status: lastStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
