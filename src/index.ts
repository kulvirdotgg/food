import { Eta } from "eta"

import index from "@/templates/index.html"
import { GeminiDishSelector } from "@/agent"
import { initDb } from "@/db"
import { RecommendationService } from "@/recommend"
import type { Dish } from "@/types"

const eta = new Eta({ autoEscape: true })

const db = initDb()
const service = new RecommendationService({ db, selector: new GeminiDishSelector() })

const [cardTpl, badgeTpl, gridTpl] = await Promise.all([
    Bun.file(import.meta.dir + "/templates/components/card.html").text(),
    Bun.file(import.meta.dir + "/templates/components/badge.html").text(),
    Bun.file(import.meta.dir + "/templates/layouts/grid.html").text(),
])

function recommendationsHTML(dishes: Dish[]): string {
    const cards = dishes
        .map((dish, idx) => {
            const ingredients = dish.ingredients.map((label) => eta.renderString(badgeTpl, { label })).join("")
            const isPrimary = idx === 0

            return eta.renderString(cardTpl, {
                name: dish.name,
                meta: dish.cuisines.join(" · "),
                index: isPrimary ? "01" : String(idx + 1).padStart(2, "0"),
                label: idx === 0 ? "Recommended" : "Alternative",
                prominenceClass: isPrimary
                    ? "sm:col-span-2 lg:col-span-3 border-primary/70 bg-primary/10"
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

const server = Bun.serve({
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

console.info(`Food app running at http://localhost:${server.port}`)
