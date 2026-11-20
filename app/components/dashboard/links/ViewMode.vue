<script setup lang="ts">
const linksStore = useDashboardLinksStore()
</script>

<template>
  <Tabs v-model="linksStore.viewMode" default-value="cards">
    <TabsList :aria-label="$t('links.filters.view_label')">
      <TabsTrigger value="cards">
        {{ $t('links.filters.cards') }}
      </TabsTrigger>
      <TabsTrigger value="list">
        {{ $t('links.filters.list') }}
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>
