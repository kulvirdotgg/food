import { google } from "@ai-sdk/google"
import { Output, ToolLoopAgent, stepCountIs } from "ai"
import { z } from "zod"

import { MODEL_ID } from "@/config"
import type { Dish, ExploratoryLabel, HistorySummary } from "@/types"

export interface RecommendedDishSelectorInput {
    eligibleDishes: Dish[]
    history: HistorySummary
}

export interface ExplorationDishSelectorInput {
    eligibleDishes: Dish[]
    history: HistorySummary
    normalDishes: Dish[]
}

export interface DishSelector<Input, Result> {
    select(input: Input): Promise<Result>
}

export type RecommendationDishSelector = DishSelector<RecommendedDishSelectorInput, RecommendedSelectionResult>

export type ExploratoryDishSelector = DishSelector<ExplorationDishSelectorInput, ExplorationSelectionResult>

const exploratoryLabels = [
    "Light Bite",
    "Filling Meal",
    "Big Flavor",
    "Mild and Easy",
    "Crispy or Crunchy",
    "Saucy and Rich",
    "Fresh and Tangy",
    "Good to Share",
    "Regional Favorite",
    "Something Different",
    "Sweet Pick",
    "Breakfast Pick",
] as const satisfies readonly ExploratoryLabel[]

const recommendationPickSchema = z.object({
    dishId: z.string().describe("A dish id from the eligible catalog."),
    reason: z.string().min(24).max(200).describe("One concise reason this dish fits its slot."),
})

const exploratoryPickSchema = recommendationPickSchema.extend({
    label: z
        .enum(exploratoryLabels)
        .describe("A practical UI card label that tells the user why they might want this dish."),
})

const recommendationOutputSchema = z.object({
    recommended: recommendationPickSchema.describe("The single best low-friction recommendation."),
    alternatives: z
        .array(recommendationPickSchema)
        .length(3)
        .describe("Three dependable backup recommendations with varied cuisines, formats, or flavor profiles."),
})

const explorationOutputSchema = z.object({
    tryThisMaybe: z
        .array(exploratoryPickSchema)
        .length(3)
        .describe("Three valid discovery picks that are meaningfully different from the normal recommendations."),
})

export type RecommendedSelectionResult = z.infer<typeof recommendationOutputSchema>
export type ExplorationSelectionResult = z.infer<typeof explorationOutputSchema>

const providerOptions = {
    google: {
        // These are bounded selection tasks, so lower-cost thinking keeps latency down
        // without changing the structured output contract.
        thinkingConfig: {
            thinkingLevel: "low",
        },
    },
} as const

export function recommendationAgent() {
    return new ToolLoopAgent({
        model: google(MODEL_ID),
        instructions: `
You are a dependable food recommendation selector.

You receive:
- an eligible catalog of canonical dishes, including cuisines, meal types, ingredients, popularity, and flavor profiles
- a 30-day recommendation summary for one user

Choose exactly 4 eligible dish IDs:
- 1 recommended dish
- 3 alternatives

Hard rules:
- Return only ids that appear in the eligible catalog.
- Return exactly 4 unique ids.
- Do not invent dish names or ids.
- Reasons must be concrete and based on catalog fields.

Selection preferences:
- Keep the recommended dish broadly dependable and low-friction.
- Use alternatives as credible fallback choices.
- Avoid repeated cuisines or semantically overlapping dishes unless the style is clearly different.
- Use the 30-day history as a soft preference to avoid stale patterns.
    `.trim(),
        stopWhen: stepCountIs(1),
        providerOptions,
        output: Output.object({
            schema: recommendationOutputSchema,
            name: "food_recommendation_selection",
            description: "A structured recommended dish and three alternatives selected from the eligible catalog.",
        }),
    })
}

export function explorationRecommendationAgent() {
    return new ToolLoopAgent({
        model: google(MODEL_ID),
        instructions: `
You are a food discovery selector.

You receive:
- an eligible catalog of canonical dishes
- a 30-day recommendation summary for one user
- the normal recommendation set selected by another agent

Choose exactly 3 exploratory dish IDs that are valid real dishes and meaningfully different from the normal recommendation set.

Hard rules:
- Return only ids that appear in the eligible catalog.
- Return exactly 3 unique ids.
- Do not select any id from the normal recommendation set.
- Do not invent dish names or ids.
- Labels must be chosen from the schema enum.
- A label must match the reason. Example: do not use "Light Bite" for a rich, fried, heavy dish.
- Reasons must be concrete and explain why this pick is a useful change from the normal recommendations.

Label meanings:
- Light Bite: snack-like, lighter, less rich, or easy to eat casually.
- Filling Meal: filling enough to be the main thing someone eats.
- Big Flavor: intense, aromatic, smoky, tangy, spicy, or strongly seasoned.
- Mild and Easy: gentle, approachable, or low-risk.
- Crispy or Crunchy: crisp, crunchy, fried, toasted, or texture-led.
- Saucy and Rich: gravy-heavy, buttery, creamy, cheesy, or indulgent.
- Fresh and Tangy: herby, citrusy, cooling, yogurt-based, tamarind-led, or sour.
- Good to Share: platter-like, snackable, street-food style, or easy to split.
- Regional Favorite: tied to a specific regional cuisine.
- Something Different: unusual format, ingredient, or flavor compared with common defaults.
- Sweet Pick: dessert-like or clearly sweet.
- Breakfast Pick: commonly eaten for breakfast or a morning meal.

Similarity avoidance:
- Avoid the same cuisine as the normal set when possible.
- Avoid the same meal type as the normal set when possible.
- Avoid the same dominant ingredients when possible.
- Avoid the same flavor profile when possible.
- Prefer distinctive or moderate dishes over common defaults.
- Across the three exploratory picks, prefer different label types when accurate.
    `.trim(),
        stopWhen: stepCountIs(1),
        providerOptions,
        output: Output.object({
            schema: explorationOutputSchema,
            name: "exploratory_food_recommendation_selection",
            description: "Three discovery picks selected from the eligible catalog while avoiding the normal set.",
        }),
    })
}

export class recommendationDishSelector implements RecommendationDishSelector {
    constructor(private readonly agent: ReturnType<typeof recommendationAgent> = recommendationAgent()) {}

    async select(input: RecommendedDishSelectorInput): Promise<RecommendedSelectionResult> {
        const result = await this.agent.generate({
            prompt: [
                "Return 1 recommended dish and 3 alternatives from the eligible catalog.",
                "Keep the first pick dependable and make the alternatives credible fallbacks.",
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

export class exploratoryDishSelector implements ExploratoryDishSelector {
    constructor(
        private readonly agent: ReturnType<typeof explorationRecommendationAgent> = explorationRecommendationAgent(),
    ) {}

    async select(input: ExplorationDishSelectorInput): Promise<ExplorationSelectionResult> {
        const result = await this.agent.generate({
            prompt: [
                "Return 3 try-this-maybe dishes from the eligible catalog.",
                "Make them meaningfully different from the normal recommendation set and give each a practical label.",
                "",
                "Normal recommendation set to avoid/swerve away from JSON:",
                JSON.stringify(input.normalDishes, null, 2),
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
