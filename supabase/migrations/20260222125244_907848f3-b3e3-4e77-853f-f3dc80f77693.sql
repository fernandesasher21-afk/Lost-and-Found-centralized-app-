
-- Clean up overly permissive User table policies
DROP POLICY IF EXISTS "allow_authenticated_all" ON public."User";
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public."User";
