
-- Allow authenticated users to view all claims (for admin review)
CREATE POLICY "Authenticated can view all claims"
ON public."Claim"
FOR SELECT
USING (true);
