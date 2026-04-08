/**
 * Translates Supabase/PostgreSQL errors into user-friendly messages
 */
export function getUserFriendlyError(error: any, context?: string): string {
  const errorMessage = error?.message || error?.error?.message || String(error);
  const errorCode = error?.code || error?.error?.code;

  // Unique constraint violations (duplicate entries)
  if (errorMessage.includes("duplicate key value violates unique constraint")) {
    if (errorMessage.includes("pid") || errorMessage.includes("_pid")) {
      return "This PID is already taken by another user";
    }
    if (errorMessage.includes("email") || errorMessage.includes("_email")) {
      return "This email is already registered";
    }
    return "This information is already in use by another account";
  }

  // Check constraint violations
  if (errorMessage.includes("violates check constraint")) {
    return "Please check your input and try again";
  }

  // Foreign key violations
  if (errorMessage.includes("violates foreign key constraint")) {
    return "Related record not found. Please refresh and try again";
  }

  // Authentication errors
  if (errorMessage.includes("Invalid login credentials")) {
    return "Incorrect email or password. Please try again";
  }

  if (errorMessage.includes("Email not confirmed")) {
    return "Please check your email and confirm your account first";
  }

  if (errorMessage.includes("User already registered")) {
    return "An account with this email already exists";
  }

  if (errorMessage.includes("Password should be at least")) {
    return "Password must be at least 6 characters";
  }

  if (errorMessage.includes("Unable to validate email")) {
    return "Invalid email address. Please check and try again";
  }

  // Storage errors
  if (errorMessage.includes("storage") || errorMessage.includes("bucket")) {
    if (errorMessage.includes("not found")) {
      return "Storage not configured. Please contact support";
    }
    return "Failed to upload file. Please try again";
  }

  // Row Level Security errors
  if (errorMessage.includes("policy") || errorMessage.includes("permission")) {
    return "You don't have permission to perform this action";
  }

  // Network/connection errors
  if (
    errorMessage.includes("network") ||
    errorMessage.includes("fetch") ||
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("NetworkError")
  ) {
    return "Network error. Please check your connection and try again";
  }

  // Timeout errors
  if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
    return "Request timed out. Please try again";
  }

  // Rate limiting
  if (errorMessage.includes("rate limit") || errorMessage.includes("too many")) {
    return "Too many requests. Please wait a moment and try again";
  }

  // JWT/Session errors
  if (errorMessage.includes("JWT") || errorMessage.includes("session")) {
    return "Your session has expired. Please log in again";
  }

  // Edge function errors
  if (errorMessage.includes("Edge Function") || errorMessage.includes("function")) {
    return "A server error occurred. Please try again later";
  }

  // Generic database errors
  if (errorMessage.includes("database") || errorMessage.includes("connection")) {
    return "A database error occurred. Please try again";
  }

  // Context-specific fallbacks
  if (context === "profile") {
    return "Failed to update profile. Please try again";
  }
  if (context === "upload") {
    return "Failed to upload file. Please try again";
  }
  if (context === "login") {
    return "Login failed. Please check your credentials";
  }
  if (context === "register") {
    return "Registration failed. Please try again";
  }
  if (context === "report") {
    return "Failed to submit report. Please try again";
  }

  // If we can extract a reasonably clean message, use it
  // Otherwise use a generic message
  const cleanMessage = errorMessage.replace(/^error:\s*/i, "").trim();
  if (cleanMessage.length < 100 && !cleanMessage.includes("constraint") && !cleanMessage.includes("violates")) {
    return cleanMessage;
  }

  return "Something went wrong. Please try again";
}