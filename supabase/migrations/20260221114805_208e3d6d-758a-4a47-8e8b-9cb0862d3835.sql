-- Fix: Drop incorrect FK constraints on claim_id that block inserts
-- claim_id should NOT reference Found_Item or Admin/Incharge Staff
ALTER TABLE public."Claim" DROP CONSTRAINT IF EXISTS "Claim_claim_id_fkey";
ALTER TABLE public."Claim" DROP CONSTRAINT IF EXISTS "Claim_claim_id_fkey1";

-- Add proper FK from item_id to Found_Item.found_id instead
ALTER TABLE public."Claim" ADD CONSTRAINT "Claim_item_id_fkey" 
  FOREIGN KEY (item_id) REFERENCES public."Found_Item"(found_id);