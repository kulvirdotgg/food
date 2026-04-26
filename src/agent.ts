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
        .describe(`Exactly ${RECOMMENDATION_COUNT} dish ids selected from the eligible catalog.`),
})

export function recommendationAgent() {
    return new ToolLoopAgent({
        model: google(MODEL_ID),
        instructions: `
You are a food recommendation selector.

You receive:
- an eligible catalog of canonical dishes
- a 30-day recommendation summary for one user

Your job is to choose exactly ${RECOMMENDATION_COUNT} dish IDs from the eligible catalog.

Hard rules:
- Return only ids that appear in the eligible catalog.
- Return exactly ${RECOMMENDATION_COUNT} ids.
- Do not invent dish names or ids.

Selection preferences:
- Build a broad idea set that feels varied to a human deciding what to eat.
- Prefer cuisine diversity across the batch.
- Avoid semantically overlapping dishes when possible.
- Use the 30-day history only as a soft preference to avoid stale patterns.
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
                "Select the strongest recommendation set from the eligible catalog.",
                `Think about giving the user ${input.count} genuinely different meal ideas.`,
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
