export interface LostItem {
  lost_id: number;
  category: string;
  status: string;
  location: string;
  date_lost: string;
  description: string;
  image_path?: string;
  user_name?: string;
}

export interface FoundItem {
  found_id: number;
  status: string;
  description: string;
  date_found: string;
  category: string;
  location: string;
  image_path?: string;
  reported_by?: string;
}

export interface Claim {
  claim_id: number;
  claim_status: string;
  claim_date: string;
  verification_status: string;
  item_description: string;
  claimant_name: string;
  item_type: "lost" | "found";
}

export interface Notification {
  notification_id: number;
  message: string;
  date_sent: string;
  status: string;
}

export const categories = [
  "Electronics",
  "ID Cards",
  "Books",
  "Wallets",
  "Keys",
  "Clothing",
  "Accessories",
];

export const locations = [
  "Library",
  "Cafeteria",
  "Lecture Hall A",
  "Lecture Hall B",
  "Computer Lab",
  "Sports Complex",
  "Parking Lot",
  "Main Gate",
  "Admin Block",
];

export const mockLostItems: LostItem[] = [
  { lost_id: 1, category: "Electronics", status: "Lost", location: "Library", date_lost: "2026-02-15", description: "Black Samsung earbuds in a white case", user_name: "Arjun Mehta" },
  { lost_id: 2, category: "ID Cards", status: "Lost", location: "Cafeteria", date_lost: "2026-02-14", description: "University ID card with lanyard", user_name: "Priya Sharma" },
  { lost_id: 3, category: "Books", status: "Matched", location: "Lecture Hall A", date_lost: "2026-02-13", description: "Data Structures textbook by Cormen", user_name: "Rahul Gupta" },
  { lost_id: 4, category: "Wallets", status: "Lost", location: "Parking Lot", date_lost: "2026-02-12", description: "Brown leather wallet with initials R.K.", user_name: "Rohan Kumar" },
  { lost_id: 5, category: "Keys", status: "Returned", location: "Admin Block", date_lost: "2026-02-10", description: "Set of 3 keys with a blue keychain", user_name: "Ananya Joshi" },
];

export const mockFoundItems: FoundItem[] = [
  { found_id: 1, status: "Found", description: "Silver laptop charger (Dell)", date_found: "2026-02-16", category: "Electronics", location: "Computer Lab", reported_by: "Staff - Vinay" },
  { found_id: 2, status: "Found", description: "Blue water bottle with stickers", date_found: "2026-02-15", category: "Accessories", location: "Sports Complex", reported_by: "Staff - Meera" },
  { found_id: 3, status: "Claimed", description: "Student ID card - Ravi Patel", date_found: "2026-02-14", category: "ID Cards", location: "Main Gate", reported_by: "Staff - Vinay" },
  { found_id: 4, status: "Found", description: "Pair of reading glasses in black case", date_found: "2026-02-13", category: "Accessories", location: "Library", reported_by: "Staff - Meera" },
];

export const mockClaims: Claim[] = [
  { claim_id: 1, claim_status: "Pending", claim_date: "2026-02-16", verification_status: "Under Review", item_description: "Silver laptop charger (Dell)", claimant_name: "Vikram Singh", item_type: "found" },
  { claim_id: 2, claim_status: "Approved", claim_date: "2026-02-15", verification_status: "Verified", item_description: "Student ID card - Ravi Patel", claimant_name: "Ravi Patel", item_type: "found" },
  { claim_id: 3, claim_status: "Rejected", claim_date: "2026-02-14", verification_status: "Failed", item_description: "Blue water bottle with stickers", claimant_name: "Unknown User", item_type: "found" },
];

export const mockNotifications: Notification[] = [
  { notification_id: 1, message: "Your claim for 'Silver laptop charger' is under review.", date_sent: "2026-02-16", status: "Unread" },
  { notification_id: 2, message: "A matching item has been found for your lost 'Data Structures textbook'.", date_sent: "2026-02-15", status: "Read" },
  { notification_id: 3, message: "Your claim for 'Student ID card' has been approved!", date_sent: "2026-02-15", status: "Read" },
];
