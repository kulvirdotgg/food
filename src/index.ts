import { Eta } from "eta"

import index from "@/templates/index.html"
import { exploratoryDishSelector, recommendationDishSelector } from "@/agent"
import { initDb } from "@/db"
import { RecommendationService } from "@/recommend"
import type { DishRecommendation } from "@/types"

const eta = new Eta({ autoEscape: true })

const db = initDb()
const service = new RecommendationService({
    db,
    recommendationSelector: new recommendationDishSelector(),
    exploratorySelector: new exploratoryDishSelector(),
})

const [cardTpl, badgeTpl, gridTpl] = await Promise.all([
    Bun.file(import.meta.dir + "/templates/components/card.html").text(),
    Bun.file(import.meta.dir + "/templates/components/badge.html").text(),
    Bun.file(import.meta.dir + "/templates/layouts/grid.html").text(),
])

function recommendationsHTML(recommendations: DishRecommendation[]): string {
    const cards = recommendations
        .map((recommendation, idx) => {
            const ingredients = recommendation.dish.ingredients
                .map((label) => eta.renderString(badgeTpl, { label }))
                .join("")
            const isPrimary = idx === 0
            const isExploratory = recommendation.slot === "try_this_maybe"

            return eta.renderString(cardTpl, {
                name: recommendation.dish.name,
                meta: recommendation.dish.cuisines.join(" · "),
                index: isPrimary ? "01" : String(idx + 1).padStart(2, "0"),
                label: recommendation.label,
                prominenceClass: isPrimary
                    ? "sm:col-span-2 lg:col-span-3 border-primary/70 bg-primary/10"
                    : isExploratory
                      ? "col-span-1 border-accent/40"
                      : "col-span-1",
                ingredients,
            })
        })
        .join("")

    return eta.renderString(gridTpl, {
        header: "[ recommendation ready ]",
        cards,
    })
}

Bun.serve({
    port: 3000,
    idleTimeout: 255,
    routes: {
        "/": index,
        "/api/health": new Response("ok"),
        "/api/recommend": {
            POST: async (request) => {
                const userId = request.cookies.get("user_id")
                if (!userId) {
                    return new Response("Unauthorized", { status: 401 })
                }

                const dishes = await service.recommend(userId)
                return new Response(recommendationsHTML(dishes), {
                    headers: { "content-type": "text/html; charset=utf-8" },
                })
            },
        },
    },
    fetch() {
        return new Response("Not found", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
        })
    },
})
