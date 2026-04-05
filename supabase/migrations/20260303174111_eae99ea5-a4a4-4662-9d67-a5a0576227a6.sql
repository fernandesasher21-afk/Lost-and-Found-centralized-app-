
-- RPC function to match lost items against found items
create or replace function public.match_lost_to_found(
  _embedding vector(1536),
  _subcategory text,
  _limit int default 5
)
returns table (
  found_id bigint,
  name text,
  category varchar,
  subcategory text,
  location text,
  date_found date,
  description text,
  image_path text,
  status varchar,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
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
    1 - (f.image_embedding <=> _embedding) as similarity
  from public."Found_Item" f
  where f.image_embedding is not null
    and f.status = 'Found'
  order by f.image_embedding <=> _embedding
  limit _limit;
$$;

-- RPC function to match found items against lost items
create or replace function public.match_found_to_lost(
  _embedding vector(1536),
  _subcategory text,
  _limit int default 5
)
returns table (
  lost_id bigint,
  name text,
  category varchar,
  subcategory text,
  location text,
  date_lost date,
  description text,
  image_path text,
  status varchar,
  user_id uuid,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
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
    1 - (l.image_embedding <=> _embedding) as similarity
  from public."Lost_Item" l
  where l.image_embedding is not null
    and l.status = 'Lost'
  order by l.image_embedding <=> _embedding
  limit _limit;
$$;
