
-- Update match_lost_to_found to use correct column names (lost_embedding → found_embedding)
CREATE OR REPLACE FUNCTION public.match_lost_to_found(_embedding vector, _subcategory text, _limit integer DEFAULT 5)
 RETURNS TABLE(found_id bigint, name text, category character varying, subcategory text, location text, date_found date, description text, image_path text, status character varying, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  select
    f.found_id,
    f.name,
    f.category,
    f.subcategory,
    f.location,
    f.date_found,
    f.description,
    f.image_path,
    f.status,
    1 - (f.found_embedding <=> _embedding) as similarity
  from public."Found_Item" f
  where f.found_embedding is not null
    and f.status = 'Found'
  order by f.found_embedding <=> _embedding
  limit _limit;
$$;

-- Update match_found_to_lost to use correct column names (image_embedding → lost_embedding)
CREATE OR REPLACE FUNCTION public.match_found_to_lost(_embedding vector, _subcategory text, _limit integer DEFAULT 5)
 RETURNS TABLE(lost_id bigint, name text, category character varying, subcategory text, location text, date_lost date, description text, image_path text, status character varying, user_id uuid, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  select
    l.lost_id,
    l.name,
    l.category,
    l.subcategory,
    l.location,
    l.date_lost,
    l.description,
    l.image_path,
    l.status,
    l.user_id,
    1 - (l.lost_embedding <=> _embedding) as similarity
  from public."Lost_Item" l
  where l.lost_embedding is not null
    and l.status = 'Lost'
  order by l.lost_embedding <=> _embedding
  limit _limit;
$$;
