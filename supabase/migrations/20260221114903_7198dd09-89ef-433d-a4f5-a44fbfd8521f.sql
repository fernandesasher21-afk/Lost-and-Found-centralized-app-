-- Allow admins to update Lost_Item status (for marking as Matched)
CREATE POLICY "Admins can update lost items"
  ON public."Lost_Item"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin'
    )
  );