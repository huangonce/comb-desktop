<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <q-page-container>
    <div class="q-pa-md">
      <RouterView v-slot="{ Component }">
        <KeepAlive>
          <Suspense>
            <template #default>
              <component :is="Component" />
            </template>
          </Suspense>
        </KeepAlive>
      </RouterView>
    </div>
  </q-page-container>
</template>
