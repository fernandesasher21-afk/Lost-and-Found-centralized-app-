-- Update handle_new_user to respect role from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  selected_role text;
  final_role public.app_role;
BEGIN
  -- Get role from user metadata, default to 'user'
  selected_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  
  -- Map to valid app_role enum
  IF selected_role = 'admin' THEN
    final_role := 'admin'::public.app_role;
  ELSE
    final_role := 'user'::public.app_role;
  END IF;
  
  INSERT INTO public."User" (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    selected_role
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, final_role);
  
  RETURN NEW;
END;
$function$;