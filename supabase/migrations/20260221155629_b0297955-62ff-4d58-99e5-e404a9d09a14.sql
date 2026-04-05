
-- Fix Found_Item: drop restrictive SELECT and recreate as permissive
DROP POLICY IF EXISTS "Anyone can view found items" ON public."Found_Item";
CREATE POLICY "Anyone can view found items"
  ON public."Found_Item"
  FOR SELECT
  USING (true);

-- Fix Lost_Item: drop restrictive SELECT and recreate as permissive
DROP POLICY IF EXISTS "Anyone can view lost items" ON public."Lost_Item";
CREATE POLICY "Anyone can view lost items"
  ON public."Lost_Item"
  FOR SELECT
  USING (true);

-- Fix User: drop restrictive SELECT and recreate as permissive for counting
DROP POLICY IF EXISTS "Users can view own profile" ON public."User";
CREATE POLICY "Users can view own profile"
  ON public."User"
  FOR SELECT
  USING (true);
