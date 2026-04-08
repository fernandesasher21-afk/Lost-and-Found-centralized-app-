-- Create rate_limits table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL, -- IP address or User ID
    endpoint TEXT NOT NULL,
    request_count INT DEFAULT 1,
    last_request_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(key, endpoint)
);

-- Index for faster cleanup and lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_endpoint ON public.rate_limits(key, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_last_request_at ON public.rate_limits(last_request_at);

-- Function to check and update rate limit
-- Returns TRUE if allowed, FALSE if rate limited
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    _key TEXT,
    _endpoint TEXT,
    _limit INT,
    _window_interval INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    curr_count INT;
    last_req TIMESTAMPTZ;
BEGIN
    -- Get current stats for the key/endpoint
    SELECT request_count, last_request_at INTO curr_count, last_req
    FROM public.rate_limits
    WHERE key = _key AND endpoint = _endpoint;

    -- Case 1: No previous records, create new
    IF NOT FOUND THEN
        INSERT INTO public.rate_limits (key, endpoint, request_count, last_request_at)
        VALUES (_key, _endpoint, 1, NOW());
        RETURN TRUE;
    END IF;

    -- Case 2: Window has passed, reset count
    IF last_req < NOW() - _window_interval THEN
        UPDATE public.rate_limits
        SET request_count = 1, last_request_at = NOW()
        WHERE key = _key AND endpoint = _endpoint;
        RETURN TRUE;
    END IF;

    -- Case 3: Within window, check limit
    IF curr_count < _limit THEN
        UPDATE public.rate_limits
        SET request_count = curr_count + 1, last_request_at = NOW()
        WHERE key = _key AND endpoint = _endpoint;
        RETURN TRUE;
    END IF;

    -- Case 4: Limit exceeded
    RETURN FALSE;
END;
$$;

-- Automatic cleanup of old rate limit records (older than 24 hours)
-- In a real app, this would be a CRON job, but here we can just do it occasionally in the function call
-- or rely on the logic above to just update old records.
-- For now, let's add a manual cleanup call inside to keep the table small
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
    DELETE FROM public.rate_limits WHERE last_request_at < NOW() - INTERVAL '24 hours';
$$;

-- Enable RLS on rate_limits but don't allow any public access (only accessible via SECURITY DEFINER function)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No public access to rate_limits" ON public.rate_limits FOR ALL USING (false);
