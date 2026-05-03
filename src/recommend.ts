import { catalog, catalogById } from "@/catalog"
import { COOLDOWN_DAYS, HISTORY_SUMMARY_DAYS, RECOMMENDATION_COUNT } from "@/config"
import type { DB } from "@/db"
import type { ExploratoryDishSelector, RecommendationDishSelector } from "@/agent"
import type { Dish, DishRecommendation, HistoryDishSummary, HistoryRow, HistorySummary } from "@/types"

interface RecommendationServiceDeps {
    db: DB
    recommendationSelector: RecommendationDishSelector
    exploratorySelector: ExploratoryDishSelector
}

export class RecommendationService {
    constructor(private readonly deps: RecommendationServiceDeps) {}

    async recommend(userId: string): Promise<DishRecommendation[]> {
        const now = new Date()

        const historySince = new Date(now)
        historySince.setUTCDate(historySince.getUTCDate() - HISTORY_SUMMARY_DAYS)

        const historyRows = this.deps.db.getRecommendationHistory(userId, historySince.toISOString())

        const cooldownSince = new Date(now)
        cooldownSince.setUTCDate(cooldownSince.getUTCDate() - COOLDOWN_DAYS)

        const recentDishIds = new Set(
            historyRows.filter((row) => row.recommended_at >= cooldownSince.toISOString()).map((row) => row.dish_id),
        )
        const eligibleDishes = catalog.filter((dish) => !recentDishIds.has(dish.id))

        if (eligibleDishes.length < RECOMMENDATION_COUNT) {
            throw new Error(`Not enough eligible dishes to recommend ${RECOMMENDATION_COUNT} items.`)
        }

        const historySignals = this.getHistorySignals(historyRows)

        const normalResult = await this.deps.recommendationSelector.select({
            eligibleDishes,
            history: historySignals,
        })

        const normalDishIds = [normalResult.recommended.dishId, ...normalResult.alternatives.map((pick) => pick.dishId)]
        this.assertUniqueDishIds(normalDishIds, "Normal selector")

        const normalDishes = this.resolveDishes(normalDishIds, "Normal selector")
        const normalDishIdSet = new Set(normalDishIds)
        const explorationEligibleDishes = eligibleDishes.filter((dish) => !normalDishIdSet.has(dish.id))

        if (explorationEligibleDishes.length < 3) {
            throw new Error("Not enough eligible dishes to select exploratory recommendations.")
        }

        const explorationResult = await this.deps.exploratorySelector.select({
            eligibleDishes: explorationEligibleDishes,
            history: historySignals,
            normalDishes,
        })

        const explorationDishIds = explorationResult.tryThisMaybe.map((pick) => pick.dishId)
        this.assertUniqueDishIds(explorationDishIds, "Exploration selector")

        const selectedDishIds = [...normalDishIds, ...explorationDishIds]
        this.assertUniqueDishIds(selectedDishIds, "Recommendation selectors")

        const selectedDishes = [...normalDishes, ...this.resolveDishes(explorationDishIds, "Exploration selector")]

        if (selectedDishIds.length !== RECOMMENDATION_COUNT) {
            throw new Error(`Recommendation selectors returned ${selectedDishIds.length} dishes.`)
        }

        this.deps.db.insertRecommendationBatch(userId, selectedDishIds, now.toISOString())

        return [
            {
                dish: selectedDishes[0]!,
                slot: "recommended",
                label: "Recommended",
                reason: normalResult.recommended.reason,
            },
            ...normalResult.alternatives.map((pick, index) => ({
                dish: selectedDishes[index + 1]!,
                slot: "alternative" as const,
                label: "Alternative" as const,
                reason: pick.reason,
            })),
            ...explorationResult.tryThisMaybe.map((pick, index) => ({
                dish: selectedDishes[index + 4]!,
                slot: "try_this_maybe" as const,
                label: pick.label,
                reason: pick.reason,
            })),
        ]
    }

    private resolveDishes(dishIds: string[], selectorName: string): Dish[] {
        return dishIds.map((dishId) => {
            const dish = catalogById.get(dishId)
            if (!dish) {
                throw new Error(`${selectorName} selected unknown dish id: ${dishId}`)
            }
            return dish
        })
    }

    private assertUniqueDishIds(dishIds: string[], selectorName: string): void {
        if (new Set(dishIds).size !== dishIds.length) {
            throw new Error(`${selectorName} returned duplicate dish ids.`)
        }
    }

    private getHistorySignals(historyRows: HistoryRow[]): HistorySummary {
        const cuisineCounts = new Map<string, number>()
        const dishCounts = new Map<
            string,
            {
                dish: Dish
                shown_count: number
                last_recommended_at: string
            }
        >()

        for (const row of historyRows) {
            const dish = catalogById.get(row.dish_id)
            if (!dish) {
                continue
            }

            for (const cuisine of dish.cuisines) {
                cuisineCounts.set(cuisine, (cuisineCounts.get(cuisine) ?? 0) + 1)
            }

            const existing = dishCounts.get(dish.id)
            if (existing) {
                existing.shown_count += 1
                if (row.recommended_at > existing.last_recommended_at) {
                    existing.last_recommended_at = row.recommended_at
                }
                continue
            }

            dishCounts.set(dish.id, {
                dish,
                shown_count: 1,
                last_recommended_at: row.recommended_at,
            })
        }

        const recentlyShownDishes: HistoryDishSummary[] = Array.from(dishCounts.values())
            .sort((a, b) => b.shown_count - a.shown_count || b.last_recommended_at.localeCompare(a.last_recommended_at))
            .map(({ dish, shown_count, last_recommended_at }) => ({
                id: dish.id,
                name: dish.name,
                cuisines: dish.cuisines,
                meal_type: dish.meal_type,
                ingredients: dish.ingredients,
                popularity: dish.popularity,
                flavor_profile: dish.flavor_profile,
                shown_count,
                last_recommended_at,
            }))

        return {
            recentlyShownDishes,
            topCuisines: Array.from(cuisineCounts.entries())
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([cuisine, count]) => ({ cuisine, count })),
        }
    }
}
