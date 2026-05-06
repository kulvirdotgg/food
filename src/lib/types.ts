export type MealType =
    | "breakfast"
    | "bread"
    | "curry"
    | "dessert"
    | "dip"
    | "grill"
    | "main_course"
    | "noodle_dish"
    | "rice_dish"
    | "salad"
    | "sandwich_wrap"
    | "snack"
    | "soup"
    | "street_food"

export type DishPopularity = "common" | "moderate" | "distinctive"

export type Dish = {
    id: string
    name: string
    cuisines: string[]
    meal_type: MealType
    ingredients: string[]
    popularity: DishPopularity
    flavor_profile: string[]
}

export type RecommendationSlot =
    | "recommended"
    | "alternative"
    | "try_this_maybe"

export type ExploratoryLabel =
    | "Light Bite"
    | "Filling Meal"
    | "Big Flavor"
    | "Mild and Easy"
    | "Crispy or Crunchy"
    | "Saucy and Rich"
    | "Fresh and Tangy"
    | "Good to Share"
    | "Regional Favorite"
    | "Something Different"
    | "Sweet Pick"
    | "Breakfast Pick"

export type DishRecommendation = {
    dish: Dish
    slot: RecommendationSlot
    label: "Recommended" | "Alternative" | ExploratoryLabel
    reason: string
}

export type RecommendationResult = {
    recommended: DishRecommendation
    others: DishRecommendation[]
}

export type HistoryRow = {
    id: string
    dish_id: string
    batch_id: string
    recommended_at: string
}

export type HistoryDishSummary = {
    id: string
    name: string
    cuisines: string[]
    meal_type: MealType
    ingredients: string[]
    popularity: DishPopularity
    flavor_profile: string[]
    shown_count: number
    last_recommended_at: string
}

export type HistorySummary = {
    recentlyShownDishes: HistoryDishSummary[]
    topCuisines: Array<{ cuisine: string; count: number }>
}
