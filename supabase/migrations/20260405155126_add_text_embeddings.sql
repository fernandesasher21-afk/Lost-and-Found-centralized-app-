-- Add text_embedding column (using OpenAI text-embedding-3-small length 1536)
alter table public."Lost_Item" add column if not exists text_embedding vector(1536);
alter table public."Found_Item" add column if not exists text_embedding vector(1536);

-- Create HNSW vector indexes for text cosine similarity (Optional but recommended for speed)
create index if not exists idx_lost_item_text_embedding on public."Lost_Item" using hnsw (text_embedding vector_cosine_ops);
create index if not exists idx_found_item_text_embedding on public."Found_Item" using hnsw (text_embedding vector_cosine_ops);

-- Update match_lost_to_found_text for LLM text matching
CREATE OR REPLACE FUNCTION public.match_lost_to_found_text(_embedding vector(1536), _subcategory text, _limit integer DEFAULT 5)
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
  order by f.text_embedding <=> _embedding
  limit _limit;
$$;

-- Update match_found_to_lost_text for LLM text matching
CREATE OR REPLACE FUNCTION public.match_found_to_lost_text(_embedding vector(1536), _subcategory text, _limit integer DEFAULT 5)
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
  order by l.text_embedding <=> _embedding
  limit _limit;
$$;
