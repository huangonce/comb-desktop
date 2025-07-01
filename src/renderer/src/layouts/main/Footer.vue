<script setup lang="ts">
import dayjs from 'dayjs'
import { version } from '../../../../../package.json'
</script>

<template>
  <q-footer class="bg-grey-3 text-black">
    <q-toolbar>
      <div>
        <span>{{ dayjs().format('YYYY') }}@ </span>
        <span>huangonce</span>
      </div>
      <q-space />
      <div>v{{ version }}</div>
      <!-- <q-toolbar-title>
          <div>Footer</div>
        </q-toolbar-title> -->
    </q-toolbar>
  </q-footer>
</template>
