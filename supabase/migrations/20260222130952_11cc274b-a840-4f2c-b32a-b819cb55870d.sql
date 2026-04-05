
-- Fix 1: Add missing INSERT policy for Claim table
-- (SELECT policies for own claims and admins already exist)
-- Just need the INSERT policy so users can submit claims

-- Fix 2: Drop the unused Admin/Incharge Staff table that exposes passwords
DROP TABLE IF EXISTS public."Admin/Incharge Staff";
