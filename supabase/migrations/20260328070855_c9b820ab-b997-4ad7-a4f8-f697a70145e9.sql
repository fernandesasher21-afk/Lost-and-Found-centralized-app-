-- Allow users to delete their own lost items
CREATE POLICY "Users can delete own lost items"
ON public."Lost_Item"
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow admins to delete any lost item
CREATE POLICY "Admins can delete lost items"
ON public."Lost_Item"
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow admins to delete found items
CREATE POLICY "Admins can delete found items"
ON public."Found_Item"
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));