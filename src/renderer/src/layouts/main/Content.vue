<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <q-page-container>
    <div class="q-pa-md">
      <!-- <RouterView v-slot="{ Component }">
        <template v-if="Component">
          <KeepAlive>
            <Suspense>
              <component :is="Component"></component>
              <template #fallback> 正在加载... </template>
            </Suspense>
          </KeepAlive>
        </template>
      </RouterView> -->
      <RouterView></RouterView>
    </div>
  </q-page-container>
</template>
