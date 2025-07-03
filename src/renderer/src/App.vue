<script setup lang="ts">
import { RouterView } from 'vue-router'
import useAutoUpdater from './composables/useAutoUpdater'

useAutoUpdater()
</script>

<template>
  <RouterView />
</template>
