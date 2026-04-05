
-- Enable RLS on Found_Item and Admin tables
ALTER TABLE public."Found_Item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Admin/Incharge Staff" ENABLE ROW LEVEL SECURITY;

-- Lost_Item INSERT policy
CREATE POLICY "Users can insert lost items"
ON public."Lost_Item" FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Found_Item policies
CREATE POLICY "Anyone can view found items"
ON public."Found_Item" FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert found items"
ON public."Found_Item" FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admin can update found items"
ON public."Found_Item" FOR UPDATE
TO authenticated
USING (true);

-- Admin table read policy
CREATE POLICY "Authenticated users can view admin staff"
ON public."Admin/Incharge Staff" FOR SELECT
TO authenticated
USING (true);
