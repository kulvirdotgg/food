import { createClient } from "@libsql/client"

import type { HistoryRow } from "@/lib/types"

const client = createClient({
    url: import.meta.env.DB_URL,
    authToken: import.meta.env.DB_AUTH_TOKEN,
})

export type RecommendationBatch = {
    batch_id: string
    recommended_at: string
    dish_ids: string[]
}

export async function getRecommendationBatches(
    userId: string,
): Promise<RecommendationBatch[]> {
    const result = await client.execute({
        sql: `
      SELECT
          batch_id,
          MAX(recommended_at) AS recommended_at,
          json_group_array(dish_id) AS dish_ids
      FROM recommendation_history
      WHERE user_id = ?
      GROUP BY batch_id
      ORDER BY MAX(recommended_at) DESC
    `,
        args: [userId],
    })

    return result.rows.map((row) => ({
        batch_id: row.batch_id as string,
        recommended_at: row.recommended_at as string,
        dish_ids: JSON.parse(row.dish_ids as string) as string[],
    }))
}

export async function getRecommendationHistory(
    userId: string,
    sinceIso: string,
): Promise<HistoryRow[]> {
    const result = await client.execute({
        sql: `
      SELECT id, dish_id, batch_id, recommended_at
      FROM recommendation_history
      WHERE user_id = ? AND recommended_at >= ?
      ORDER BY recommended_at DESC
    `,
        args: [userId, sinceIso],
    })

    return result.rows as unknown as HistoryRow[]
}

export async function insertRecommendationBatch(
    userId: string,
    dishIds: string[],
    recommendedAtIso: string,
): Promise<void> {
    const batchId = crypto.randomUUID()
    await client.batch(
        dishIds.map((dishId) => ({
            sql: `INSERT INTO recommendation_history (id, user_id, dish_id, batch_id, recommended_at)
            VALUES (?, ?, ?, ?, ?)`,
            args: [
                crypto.randomUUID(),
                userId,
                dishId,
                batchId,
                recommendedAtIso,
            ],
        })),
        "write",
    )
}
