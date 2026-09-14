<template>
  <section
    class="
      bg-background py-16 text-foreground
      md:py-24
    "
  >
    <div class="mx-auto max-w-6xl px-6">
      <div
        class="
          mx-auto grid max-w-3xl grid-cols-2 items-center gap-4
          sm:grid-cols-3 sm:gap-10
          md:gap-16
        "
      >
        <img
          class="
            col-span-full h-auto w-full min-w-0
            sm:col-span-1
          "
          alt="Nuxt.js"
          src="@/assets/images/nuxtjs.png"
          fetchpriority="high"
          width="1256"
          height="632"
        >
        <img
          class="h-auto w-full min-w-0"
          alt="SQLite"
          src="@/assets/images/sqlite.png"
          fetchpriority="high"
          width="1768"
          height="890"
        >
        <img
          class="h-auto w-full min-w-0"
          alt="DuckDB"
          src="@/assets/images/duckdb.png"
          fetchpriority="high"
          width="1768"
          height="890"
        >
      </div>
    </div>
  </section>
</template>
