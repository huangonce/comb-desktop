<script setup lang="ts">
import { RouterView } from 'vue-router'
import useAutoUpdate from './composables/useAutoUpdate'

useAutoUpdate()
</script>

<template>
  <RouterView />
</template>
