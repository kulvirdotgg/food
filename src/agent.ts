import { google } from "@ai-sdk/google"
import { Output, ToolLoopAgent, stepCountIs } from "ai"
import { z } from "zod"

import { MODEL_ID, RECOMMENDATION_COUNT } from "@/config"
import type { Dish, HistorySummary } from "@/types"

export interface DishSelectorInput {
    eligibleDishes: Dish[]
    history: HistorySummary
    count: number
}

export interface DishSelector {
    select(input: DishSelectorInput): Promise<{ dishIds: string[] }>
}

const recommendationOutputSchema = z.object({
    dishIds: z
        .array(z.string())
        .length(RECOMMENDATION_COUNT)
        .describe(
            `Exactly ${RECOMMENDATION_COUNT} dish ids selected from the eligible catalog, ordered from best recommendation to backup options.`,
        ),
})

export function recommendationAgent() {
    return new ToolLoopAgent({
        model: google(MODEL_ID),
        instructions: `
You are a food recommendation selector.

You receive:
- an eligible catalog of canonical dishes, including cuisines, meal types, ingredients, popularity, and flavor profiles
- a 30-day recommendation summary for one user

Choose exactly ${RECOMMENDATION_COUNT} eligible dish IDs, ranked from best recommendation to backup options.

Hard rules:
- Return only ids that appear in the eligible catalog.
- Return exactly ${RECOMMENDATION_COUNT} ids.
- Do not invent dish names or ids.
- Put the best recommendation first.

Selection preferences:
- Prefer distinctive, cuisine-specific dishes over globally common defaults.
- Prefer less common dishes over very common, broadly familiar comfort foods when both are suitable.
- Do not rank a common default first unless no stronger distinctive option is eligible.
- Build a varied set across cuisines, meal types, ingredients and flavor profiles.
- Avoid repeated cuisines or semantically overlapping dishes unless the style is clearly different.
- Use the 30-day history as a soft preference to avoid stale patterns.
    `.trim(),
        stopWhen: stepCountIs(1),
        providerOptions: {
            google: {
                // this task is bounded selection, so lower-cost thinking keeps latency down
                // without changing the selection contract.
                thinkingConfig: {
                    thinkingLevel: "low",
                },
            },
        },
        output: Output.object({
            schema: recommendationOutputSchema,
            name: "food_recommendation_selection",
            description: "A structured list of dish ids selected from the eligible catalog.",
        }),
    })
}

export class GeminiDishSelector implements DishSelector {
    constructor(private readonly agent: ReturnType<typeof recommendationAgent> = recommendationAgent()) {}

    async select(input: DishSelectorInput): Promise<{ dishIds: string[] }> {
        const result = await this.agent.generate({
            prompt: [
                `Return ${input.count} eligible dish IDs ranked from one best recommendation to varied backup suggestions.`,
                "Prefer distinctive, less common cuisine-specific dishes over very common broadly familiar dishes when both are suitable.",
                "",
                "Eligible dishes JSON:",
                JSON.stringify(input.eligibleDishes, null, 2),
                "",
                "30-day history summary JSON:",
                JSON.stringify(input.history, null, 2),
            ].join("\n"),
        })

        return result.output
    }
}
