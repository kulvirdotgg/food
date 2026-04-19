import index from "@/templates/index.html"

const server = Bun.serve({
    port: 3000,
    idleTimeout: 60,
    routes: {
        "/": index, // serves the home page
        "/health": new Response("ok"),
    },
    fetch() {
        return new Response("Not found", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8" },
        })
    },
})

console.info(`Food app running at http://localhost:${server.port}`)
