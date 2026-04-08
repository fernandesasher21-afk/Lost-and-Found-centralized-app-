-- Add date filter to text matching functions
-- When matching found items to lost items, only compare with lost items where:
-- - date_lost is before date_found
-- - date_lost is same as date_found
-- - date_lost is one day after date_found (to handle late reporting)

-- Update match_found_to_lost_text to accept date_found parameter
CREATE OR REPLACE FUNCTION public.match_found_to_lost_text(_embedding vector(1536), _subcategory text, _date_found date DEFAULT NULL, _limit integer DEFAULT 5)
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
    1 - (l.text_embedding <=> _embedding) as similarity
  from public."Lost_Item" l
  where l.text_embedding is not null
    and l.status = 'Lost'
    and (_date_found IS NULL OR l.date_lost <= _date_found + INTERVAL '1 day')
  order by l.text_embedding <=> _embedding
  limit _limit;
$$;

-- Update match_found_to_lost (image-based) to accept date_found parameter
CREATE OR REPLACE FUNCTION public.match_found_to_lost(_embedding vector, _subcategory text, _date_found date DEFAULT NULL, _limit integer DEFAULT 5)
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
    and (_date_found IS NULL OR l.date_lost <= _date_found + INTERVAL '1 day')
  order by l.lost_embedding <=> _embedding
  limit _limit;
$$;

-- Update match_lost_to_found_text to accept date_lost parameter
-- For matching lost items to found items, filter found items where date_found >= date_lost - 1 day
CREATE OR REPLACE FUNCTION public.match_lost_to_found_text(_embedding vector(1536), _subcategory text, _date_lost date DEFAULT NULL, _limit integer DEFAULT 5)
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
    1 - (f.text_embedding <=> _embedding) as similarity
  from public."Found_Item" f
  where f.text_embedding is not null
    and f.status = 'Found'
    and (_date_lost IS NULL OR f.date_found >= _date_lost - INTERVAL '1 day')
  order by f.text_embedding <=> _embedding
  limit _limit;
$$;

-- Update match_lost_to_found (image-based) to accept date_lost parameter
CREATE OR REPLACE FUNCTION public.match_lost_to_found(_embedding vector, _subcategory text, _date_lost date DEFAULT NULL, _limit integer DEFAULT 5)
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
    and (_date_lost IS NULL OR f.date_found >= _date_lost - INTERVAL '1 day')
  order by f.found_embedding <=> _embedding
  limit _limit;
$$;