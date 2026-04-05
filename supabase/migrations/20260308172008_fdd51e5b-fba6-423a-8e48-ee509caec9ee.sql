ALTER TABLE public."Lost_Item" ADD COLUMN IF NOT EXISTS ai_description text;
ALTER TABLE public."Found_Item" ADD COLUMN IF NOT EXISTS ai_description text;