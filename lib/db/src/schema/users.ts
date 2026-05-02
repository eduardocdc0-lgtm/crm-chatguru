import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { agentsTable } from "./agents";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // "admin" | "agent"
  agentId: integer("agent_id").references(() => agentsTable.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
