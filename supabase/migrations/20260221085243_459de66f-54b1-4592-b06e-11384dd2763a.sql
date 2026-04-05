
-- Allow authenticated users to update claims (for admin to approve/reject)
CREATE POLICY "Authenticated can update claims"
ON public."Claim"
FOR UPDATE
USING (true)
WITH CHECK (true);
