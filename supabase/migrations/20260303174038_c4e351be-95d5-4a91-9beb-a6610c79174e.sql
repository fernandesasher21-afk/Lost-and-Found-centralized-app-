
-- Enable pgvector extension
create extension if not exists vector;

-- Add embedding and subcategory columns to Lost_Item
alter table public."Lost_Item"
add column if not exists image_embedding vector(1536),
add column if not exists subcategory text;

-- Add embedding and subcategory columns to Found_Item
alter table public."Found_Item"
add column if not exists image_embedding vector(1536),
add column if not exists subcategory text;

-- Create HNSW vector indexes for cosine similarity
create index if not exists lost_item_embedding_idx on public."Lost_Item"
using hnsw (image_embedding vector_cosine_ops);

create index if not exists found_item_embedding_idx on public."Found_Item"
using hnsw (image_embedding vector_cosine_ops);

-- Create storage bucket for item images
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload images
create policy "Authenticated users can upload item images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'item-images');

-- Allow public read access to item images
create policy "Public read access to item images"
on storage.objects for select
to public
using (bucket_id = 'item-images');
