-- =====================================================================
-- AI Interview Coach — full database schema
-- Run this once in the SQL editor of YOUR OWN Supabase project.
-- Creates: profiles, resume_analyses, interview_sessions,
--          interview_questions, the "resumes" storage bucket,
--          grants, RLS policies, triggers and functions.
-- =====================================================================

-- ---------- helper functions -----------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------- profiles --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  email      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto-create a profile row on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- resume_analyses -------------------------------------------
CREATE TABLE IF NOT EXISTS public.resume_analyses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name          text NOT NULL,
  file_path          text,
  score              integer DEFAULT 0,
  skills_strength    integer DEFAULT 0,
  technical_depth    integer DEFAULT 0,
  project_impact     integer DEFAULT 0,
  ats_optimization   integer DEFAULT 0,
  improvements       jsonb   DEFAULT '[]'::jsonb,
  self_introduction  text,
  resume_text        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resume_analyses TO authenticated;
GRANT ALL ON public.resume_analyses TO service_role;
ALTER TABLE public.resume_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses"   ON public.resume_analyses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON public.resume_analyses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own analyses" ON public.resume_analyses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON public.resume_analyses FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- interview_sessions ----------------------------------------
CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_analysis_id  uuid REFERENCES public.resume_analyses(id) ON DELETE SET NULL,
  overall_score       integer DEFAULT 0,
  confidence_score    integer DEFAULT 0,
  communication_score integer DEFAULT 0,
  technical_score     integer DEFAULT 0,
  resume_match_score  integer DEFAULT 0,
  improvement_tips    jsonb   DEFAULT '[]'::jsonb,
  final_feedback      text,
  status              text NOT NULL DEFAULT 'in_progress',
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_sessions TO authenticated;
GRANT ALL ON public.interview_sessions TO service_role;
ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"   ON public.interview_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.interview_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.interview_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ---------- interview_questions ---------------------------------------
CREATE TABLE IF NOT EXISTS public.interview_questions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_number       integer NOT NULL,
  question_text         text NOT NULL,
  question_type         text NOT NULL DEFAULT 'hr',
  transcript            text,
  score                 integer DEFAULT 0,
  confidence_level      text,
  clarity               text,
  technical_depth       text,
  communication_quality text,
  sentiment             text,
  filler_words          jsonb DEFAULT '[]'::jsonb,
  feedback              text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_questions TO authenticated;
GRANT ALL ON public.interview_questions TO service_role;
ALTER TABLE public.interview_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own questions"   ON public.interview_questions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own questions" ON public.interview_questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own questions" ON public.interview_questions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ---------- indexes ----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_resume_analyses_user     ON public.resume_analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user  ON public.interview_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_questions_sess ON public.interview_questions(session_id, question_number);

-- ---------- storage: private "resumes" bucket --------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can read own resume files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload own resume files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own resume files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own resume files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =====================================================================
-- After running this:
-- 1. Deploy the edge function in supabase/functions/ai-analyze
-- 2. Set function secrets: LOVABLE_API_KEY (or your AI key) and
--    optionally ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID for AI voice
-- 3. Point .env at your project URL + anon (publishable) key
-- =====================================================================
