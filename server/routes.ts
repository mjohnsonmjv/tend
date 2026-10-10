import type { Express } from "express";
import type { Server } from "node:http";
import { storage } from "./storage";
import { insertChurchSchema, insertPrayerSchema, STATUSES } from "@shared/schema";
import type { Status } from "@shared/schema";
import { z } from "zod";

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // -------- CHURCH SIGNUP / LOOKUP --------

  app.post("/api/churches", (req, res) => {
    const parsed = insertChurchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
    }
    // Auto-generate slug if not given
    const slug = parsed.data.slug || slugify(parsed.data.name);
    const existing = storage.getChurchBySlug(slug);
    if (existing) {
      return res.status(409).json({ message: "That church URL is already taken. Try another." });
    }
    const church = storage.createChurch({ ...parsed.data, slug });
    res.json(church);
  });

  app.get("/api/churches/by-slug/:slug", (req, res) => {
    const church = storage.getChurchBySlug(req.params.slug);
    if (!church) return res.status(404).json({ message: "Church not found" });
    // Public payload: only what the prayer submission form needs
    res.json({
      slug: church.slug,
      name: church.name,
      pastorName: church.pastorName,
      greetingMessage: church.greetingMessage,
    });
  });

  app.get("/api/churches/:id", (req, res) => {
    const church = storage.getChurchById(Number(req.params.id));
    if (!church) return res.status(404).json({ message: "Church not found" });
    res.json(church);
  });

  app.get("/api/churches", (_req, res) => {
    res.json(storage.listChurches());
  });

  app.patch("/api/churches/:id/greeting", (req, res) => {
    const schema = z.object({ greeting: z.string().min(1).max(300) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid greeting" });
    const church = storage.updateChurchGreeting(Number(req.params.id), parsed.data.greeting);
    if (!church) return res.status(404).json({ message: "Church not found" });
    res.json(church);
  });

  // -------- PRAYER REQUESTS --------

  // Public submission (from QR scan landing page)
  app.post("/api/churches/by-slug/:slug/prayers", (req, res) => {
    const church = storage.getChurchBySlug(req.params.slug);
    if (!church) return res.status(404).json({ message: "Church not found" });

    const bodyWithChurch = { ...req.body, churchId: church.id };
    const parsed = insertPrayerSchema.safeParse(bodyWithChurch);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
    }
    // Strip identifying info if anonymous flag is set
    const clean = parsed.data.isAnonymous
      ? { ...parsed.data, submitterName: null, submitterPhone: null, submitterEmail: null }
      : parsed.data;
    const prayer = storage.createPrayer(clean);
    res.json({ ok: true, id: prayer.id, greetingMessage: church.greetingMessage });
  });

  app.get("/api/churches/:id/prayers", (req, res) => {
    const churchId = Number(req.params.id);
    const status = typeof req.query.status === "string" ? (req.query.status as Status) : undefined;
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    res.json(storage.listPrayersByChurch(churchId, status));
  });

  app.get("/api/churches/:id/stats", (req, res) => {
    const churchId = Number(req.params.id);
    const church = storage.getChurchById(churchId);
    if (!church) return res.status(404).json({ message: "Church not found" });
    res.json(storage.countByStatus(churchId));
  });

  app.get("/api/prayers/:id", (req, res) => {
    const prayer = storage.getPrayer(Number(req.params.id));
    if (!prayer) return res.status(404).json({ message: "Prayer not found" });
    res.json(prayer);
  });

  app.patch("/api/prayers/:id/status", (req, res) => {
    const schema = z.object({ status: z.enum(STATUSES) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid status" });
    const prayer = storage.updatePrayerStatus(Number(req.params.id), parsed.data.status);
    if (!prayer) return res.status(404).json({ message: "Prayer not found" });
    res.json(prayer);
  });

  app.patch("/api/prayers/:id/notes", (req, res) => {
    const schema = z.object({ notes: z.string().max(4000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid notes" });
    const prayer = storage.updatePrayerNotes(Number(req.params.id), parsed.data.notes);
    if (!prayer) return res.status(404).json({ message: "Prayer not found" });
    res.json(prayer);
  });

  // -------- STRIPE STUB --------
  // Wire real Stripe when keys are provided.
  app.get("/api/billing/status", (_req, res) => {
    res.json({
      configured: !!process.env.STRIPE_SECRET_KEY,
      plans: [
        { id: "starter", name: "Starter", price: 29, description: "Up to 200 members" },
        { id: "growth", name: "Growth", price: 49, description: "Up to 500 members" },
        { id: "large", name: "Large Church", price: 99, description: "500+ members" },
      ],
    });
  });

  // -------- SMS STUB (Twilio webhook) --------
  // For future: when a member opts in via QR form with phone, pastor can text back.
  app.post("/api/webhooks/twilio", (_req, res) => {
    res.status(200).send("<Response></Response>");
  });

  return httpServer;
}
