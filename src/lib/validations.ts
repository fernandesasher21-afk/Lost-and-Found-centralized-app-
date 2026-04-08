import { z } from "zod";

// Shared regex for strict HTML rejection
export const HTML_REGEX = /<[^>]*>/;

const noHtml = (val: string) => !HTML_REGEX.test(val);
const noHtmlMessage = "HTML tags are not allowed for security reasons";

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50).refine(noHtml, noHtmlMessage),
  email: z.string().email("Invalid email address"),
  pid: z.string().min(5, "PID must be at least 5 characters").max(20).refine(noHtml, noHtmlMessage),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  role: z.enum(["user", "staff", "admin"]).optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const ReportItemSchema = z.object({
  name: z.string().min(2, "Item name is too short").max(100).refine(noHtml, noHtmlMessage),
  category: z.string().min(1).max(50).refine(noHtml, noHtmlMessage),
  subcategory: z.string().max(100).optional().nullable().refine((val) => !val || noHtml(val), noHtmlMessage),
  location: z.string().min(2, "Location is required").max(200).refine(noHtml, noHtmlMessage),
  date: z.string().min(1, "Date is required"),
  description: z.string().min(10, "Description must be at least 10 characters").max(2000).refine(noHtml, noHtmlMessage),
  color: z.string().max(50).optional().nullable().refine((val) => !val || noHtml(val), noHtmlMessage),
  brand: z.string().max(100).optional().nullable().refine((val) => !val || noHtml(val), noHtmlMessage),
  marks: z.string().max(500).optional().nullable().refine((val) => !val || noHtml(val), noHtmlMessage),
});

export const ProfileSchema = z.object({
  name: z.string().min(2).max(50).refine(noHtml, noHtmlMessage),
  pid: z.string().min(5).max(20).refine(noHtml, noHtmlMessage),
});
