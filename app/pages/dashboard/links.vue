<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})

const linksStore = useDashboardLinksStore()
useDashboardLinksRouteState()
</script>

<template>
  <Tabs v-model="linksStore.status" default-value="active" as-child>
    <main class="space-y-6">
      <h1 class="sr-only">
        {{ $t('links.group_title') }}
      </h1>
      <Teleport to="#dashboard-header-actions" defer>
        <DashboardLinksSearchDialog />
        <DashboardLinksEditorModal />
      </Teleport>

      <DashboardLinksFilters />
      <TabsContent value="active">
        <DashboardLinks />
      </TabsContent>
      <TabsContent value="expired">
        <DashboardLinks />
      </TabsContent>
    </main>
  </Tabs>
</template>
