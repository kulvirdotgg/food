import { Database } from "bun:sqlite"

import { DATABASE_PATH } from "@/config.ts"
import type { HistoryRow } from "@/types.ts"

export class DB {
    private readonly database: Database

    constructor(path: string = DATABASE_PATH) {
        this.database = new Database(path)
        this.dbInit()
    }

    private dbInit(): void {
        this.database.run(`
      CREATE TABLE IF NOT EXISTS recommendation_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        dish_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        recommended_at TEXT NOT NULL
      )
    `)

        this.database.run(`
      CREATE INDEX IF NOT EXISTS idx_recommendation_history_user_recommended_at
        ON recommendation_history (user_id, recommended_at)
    `)

        this.database.run(`
      CREATE INDEX IF NOT EXISTS idx_recommendation_history_user_dish_recommended_at
        ON recommendation_history (user_id, dish_id, recommended_at)
    `)
    }

    getRecommendationHistory(userId: string, sinceIso: string): HistoryRow[] {
        return this.database
            .query(
                `
          SELECT id, dish_id, batch_id, recommended_at
          FROM recommendation_history
          WHERE user_id = ?1 AND recommended_at >= ?2
          ORDER BY recommended_at DESC
        `,
            )
            .all(userId, sinceIso) as HistoryRow[]
    }

    insertRecommendationBatch(userId: string, dishIds: string[], recommendedAtIso: string): void {
        const batchId = crypto.randomUUID()
        const insert = this.database.query(
            `
        INSERT INTO recommendation_history (id, user_id, dish_id, batch_id, recommended_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
      `,
        )

        const transaction = this.database.transaction((items: string[]) => {
            for (const dishId of items) {
                insert.run(crypto.randomUUID(), userId, dishId, batchId, recommendedAtIso)
            }
        })

        transaction(dishIds)
    }
}

let db: DB | null = null

export function initDb(): DB {
    if (db) {
        return db
    }

    db = new DB()
    return db
}

export function getDb(): DB {
    if (!db) {
        throw new Error("Database has not been initialized.")
    }
    return db
}
