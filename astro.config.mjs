// @ts-check
import { defineConfig } from "astro/config"
import clerk from "@clerk/astro"
import tailwindcss from "@tailwindcss/vite"
import vercel from "@astrojs/vercel"

// https://astro.build/config
export default defineConfig({
    adapter: vercel(),
    integrations: [
        clerk({
            signInUrl: "/sign-in",
            signUpUrl: "/sign-in",
            waitlistUrl: "/waitlist",
        }),
    ],
    output: "server",
    vite: {
        plugins: [tailwindcss()],
        resolve: {
            alias: {
                "@": "/src",
            },
        },
    },
})
