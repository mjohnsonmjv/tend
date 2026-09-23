import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * churches : a single congregation. `slug` is what appears in the public QR URL:
 * https://tend.faith/{slug}
 */
export const churches = sqliteTable("churches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  pastorName: text("pastor_name").notNull(),
  pastorEmail: text("pastor_email").notNull(),
  greetingMessage: text("greeting_message").notNull().default(
    "Thank you for sharing. I'm praying for you.",
  ),
  plan: text("plan").notNull().default("trial"), // trial | starter | growth
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: integer("created_at").notNull(),
});

/**
 * prayer_requests : one submission from a QR scan.
 */
export const prayerRequests = sqliteTable("prayer_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  churchId: integer("church_id").notNull(),
  submitterName: text("submitter_name"),
  submitterPhone: text("submitter_phone"),
  submitterEmail: text("submitter_email"),
  message: text("message").notNull(),
  category: text("category").notNull().default("prayer"), // prayer | check_in | praise | question
  isAnonymous: integer("is_anonymous", { mode: "boolean" }).notNull().default(false),
  isUrgent: integer("is_urgent", { mode: "boolean" }).notNull().default(false),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("new"), // new | praying | prayed_for | archived
  pastorNotes: text("pastor_notes"),
  createdAt: integer("created_at").notNull(),
});

export const insertChurchSchema = createInsertSchema(churches, {
  slug: (s) => s.min(3).max(40).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, hyphens only"),
  pastorEmail: (s) => s.email(),
}).omit({ id: true, createdAt: true, stripeCustomerId: true });

export const insertPrayerSchema = createInsertSchema(prayerRequests, {
  message: (s) => s.min(3).max(2000),
}).omit({ id: true, createdAt: true, status: true, pastorNotes: true });

export type Church = typeof churches.$inferSelect;
export type InsertChurch = z.infer<typeof insertChurchSchema>;
export type PrayerRequest = typeof prayerRequests.$inferSelect;
export type InsertPrayer = z.infer<typeof insertPrayerSchema>;

export const CATEGORIES = ["prayer", "check_in", "praise", "question"] as const;
export const STATUSES = ["new", "praying", "prayed_for", "archived"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Status = (typeof STATUSES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  prayer: "Prayer request",
  check_in: "Check-in",
  praise: "Praise",
  question: "Question",
};

export const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  praying: "Praying",
  prayed_for: "Prayed for",
  archived: "Archived",
};
