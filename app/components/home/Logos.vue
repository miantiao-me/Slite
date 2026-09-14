<script setup lang="ts">
import { Container, Database } from '@lucide/vue'
</script>

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
          mx-auto flex max-w-3xl flex-col gap-5 border-y py-5
          sm:flex-row sm:items-center sm:justify-between
        "
      >
        <p class="text-sm font-medium text-muted-foreground">
          {{ $t('home.logos.title') }}
        </p>
        <div
          class="
            grid grid-cols-2 gap-3
            sm:min-w-80
          "
        >
          <div
            class="flex items-center gap-2 rounded-lg border bg-card px-4 py-3"
          >
            <Container aria-hidden="true" class="size-4 text-muted-foreground" />
            <span class="text-sm font-medium">Docker</span>
          </div>
          <div
            class="flex items-center gap-2 rounded-lg border bg-card px-4 py-3"
          >
            <Database aria-hidden="true" class="size-4 text-muted-foreground" />
            <span class="text-sm font-medium">SQLite</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
