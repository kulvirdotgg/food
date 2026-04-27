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
- an eligible catalog of canonical dishes
- a 30-day recommendation summary for one user

Your job is to choose exactly ${RECOMMENDATION_COUNT} dish IDs from the eligible catalog, ranked in order.
The first ID must be the strongest single recommendation for what the user should eat next.
The remaining IDs are backup suggestions in case the user does not want the first choice.

Hard rules:
- Return only ids that appear in the eligible catalog.
- Return exactly ${RECOMMENDATION_COUNT} ids.
- Do not invent dish names or ids.
- Put the best recommendation first.

Selection preferences:
- Make the first dish feel like a clear, confident recommendation rather than one item in a list.
- Build the rest of the batch as fallback suggestions that are still appealing but meaningfully different.
- Prefer cuisine diversity across the batch.
- Balance familiar crowd-pleasers with a few more distinctive dishes.
- Avoid semantically overlapping dishes when possible, especially in the first four choices.
- Prefer variety in meal type, texture, ingredients, and heaviness.
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
                "Select and rank the strongest recommendation set from the eligible catalog.",
                `Return ${input.count} dish IDs: one best recommendation first, followed by varied backup suggestions.`,
                "Make sure the backups are unique enough that rejecting the first choice still leaves useful alternatives.",
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
