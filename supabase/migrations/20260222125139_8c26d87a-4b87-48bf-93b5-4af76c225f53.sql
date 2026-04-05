
-- Fix 1: Tighten notifications INSERT policy to prevent sender spoofing
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

CREATE POLICY "Users can insert notifications as themselves"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() OR sender_id IS NULL
  );

-- Fix 2: Restrict Claim SELECT to owners + admins (remove public viewing)
DROP POLICY IF EXISTS "Authenticated can view all claims" ON public."Claim";

CREATE POLICY "Admins can view all claims"
  ON public."Claim"
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Keep existing "Users can view own claims" policy (already exists)

-- Fix 3: Tighten Claim UPDATE to admins only (not any authenticated user)
DROP POLICY IF EXISTS "Authenticated can update claims" ON public."Claim";

CREATE POLICY "Admins can update claims"
  ON public."Claim"
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix 4: Tighten Found_Item INSERT to admins/moderators only
DROP POLICY IF EXISTS "Authenticated users can insert found items" ON public."Found_Item";

CREATE POLICY "Staff can insert found items"
  ON public."Found_Item"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
  );

-- Fix 5: Tighten Found_Item UPDATE to admins only
DROP POLICY IF EXISTS "Admin can update found items" ON public."Found_Item";

CREATE POLICY "Admins can update found items"
  ON public."Found_Item"
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix 6: Update Lost_Item admin update policy to use has_role
DROP POLICY IF EXISTS "Admins can update lost items" ON public."Lost_Item";

CREATE POLICY "Admins can update lost items"
  ON public."Lost_Item"
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix 7: Add column length constraints for input validation
ALTER TABLE public."Lost_Item"
  ADD CONSTRAINT lost_item_name_length CHECK (length(name) <= 200),
  ADD CONSTRAINT lost_item_description_length CHECK (length(description) <= 2000),
  ADD CONSTRAINT lost_item_location_length CHECK (length(location) <= 200);

ALTER TABLE public."Found_Item"
  ADD CONSTRAINT found_item_name_length CHECK (length(name) <= 200),
  ADD CONSTRAINT found_item_description_length CHECK (length(description) <= 2000),
  ADD CONSTRAINT found_item_location_length CHECK (length(location) <= 200);

ALTER TABLE public."Claim"
  ADD CONSTRAINT claim_verification_length CHECK (length(verification_details) <= 50000);

ALTER TABLE public.notifications
  ADD CONSTRAINT notification_message_length CHECK (length(message) <= 2000);
