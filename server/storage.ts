import { churches, prayerRequests } from "@shared/schema";
import type {
  Church,
  InsertChurch,
  PrayerRequest,
  InsertPrayer,
  Status,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

// Create tables on boot if they don't exist yet. Simpler than migrations for MVP.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS churches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pastor_name TEXT NOT NULL,
    pastor_email TEXT NOT NULL,
    greeting_message TEXT NOT NULL DEFAULT 'Thank you for sharing. I''m praying for you.',
    plan TEXT NOT NULL DEFAULT 'trial',
    stripe_customer_id TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prayer_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    church_id INTEGER NOT NULL,
    submitter_name TEXT,
    submitter_phone TEXT,
    submitter_email TEXT,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'prayer',
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    is_urgent INTEGER NOT NULL DEFAULT 0,
    is_private INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'new',
    pastor_notes TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_prayer_church_status ON prayer_requests(church_id, status, created_at);
`);

export const db = drizzle(sqlite);

export interface IStorage {
  // Churches
  createChurch(church: InsertChurch): Church;
  getChurchBySlug(slug: string): Church | undefined;
  getChurchById(id: number): Church | undefined;
  listChurches(): Church[];
  updateChurchGreeting(id: number, greeting: string): Church | undefined;

  // Prayer requests
  createPrayer(input: InsertPrayer): PrayerRequest;
  listPrayersByChurch(churchId: number, status?: Status): PrayerRequest[];
  getPrayer(id: number): PrayerRequest | undefined;
  updatePrayerStatus(id: number, status: Status): PrayerRequest | undefined;
  updatePrayerNotes(id: number, notes: string): PrayerRequest | undefined;
  countByStatus(churchId: number): Record<Status, number>;
}

export class DatabaseStorage implements IStorage {
  createChurch(input: InsertChurch): Church {
    return db
      .insert(churches)
      .values({ ...input, createdAt: Date.now() })
      .returning()
      .get();
  }
  getChurchBySlug(slug: string): Church | undefined {
    return db.select().from(churches).where(eq(churches.slug, slug)).get();
  }
  getChurchById(id: number): Church | undefined {
    return db.select().from(churches).where(eq(churches.id, id)).get();
  }
  listChurches(): Church[] {
    return db.select().from(churches).orderBy(desc(churches.createdAt)).all();
  }
  updateChurchGreeting(id: number, greeting: string): Church | undefined {
    return db
      .update(churches)
      .set({ greetingMessage: greeting })
      .where(eq(churches.id, id))
      .returning()
      .get();
  }

  createPrayer(input: InsertPrayer): PrayerRequest {
    return db
      .insert(prayerRequests)
      .values({ ...input, createdAt: Date.now() })
      .returning()
      .get();
  }
  listPrayersByChurch(churchId: number, status?: Status): PrayerRequest[] {
    const q = db
      .select()
      .from(prayerRequests)
      .where(
        status
          ? and(eq(prayerRequests.churchId, churchId), eq(prayerRequests.status, status))
          : eq(prayerRequests.churchId, churchId),
      )
      .orderBy(desc(prayerRequests.createdAt));
    return q.all();
  }
  getPrayer(id: number): PrayerRequest | undefined {
    return db.select().from(prayerRequests).where(eq(prayerRequests.id, id)).get();
  }
  updatePrayerStatus(id: number, status: Status): PrayerRequest | undefined {
    return db
      .update(prayerRequests)
      .set({ status })
      .where(eq(prayerRequests.id, id))
      .returning()
      .get();
  }
  updatePrayerNotes(id: number, notes: string): PrayerRequest | undefined {
    return db
      .update(prayerRequests)
      .set({ pastorNotes: notes })
      .where(eq(prayerRequests.id, id))
      .returning()
      .get();
  }
  countByStatus(churchId: number): Record<Status, number> {
    const rows = db
      .select()
      .from(prayerRequests)
      .where(eq(prayerRequests.churchId, churchId))
      .all();
    const counts: Record<Status, number> = {
      new: 0,
      praying: 0,
      prayed_for: 0,
      archived: 0,
    };
    for (const r of rows) counts[r.status as Status] += 1;
    return counts;
  }
}

export const storage = new DatabaseStorage();
