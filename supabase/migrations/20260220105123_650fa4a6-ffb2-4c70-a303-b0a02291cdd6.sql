
-- Add name column to Lost_Item
ALTER TABLE public."Lost_Item" ADD COLUMN name text;

-- Add name column to Found_Item
ALTER TABLE public."Found_Item" ADD COLUMN name text;
