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
