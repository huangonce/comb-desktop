<script lang="ts" setup>
import Footer from './main/Footer.vue'
import Header from './main/Header.vue'
import Content from './main/Content.vue'
// import { ref } from 'vue'

// const leftDrawerOpen = ref(false)
</script>

<template>
  <q-layout view="lHh LpR lff" class="bg-grey-3">
    <Header></Header>

    <!-- <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      side="left"
      class="text-white"
      style="background-color: #1d2129; height: 98px; color: oklch(98.5% 0 0)"
    >
      <q-img class="absolute-top" style="height: 98px">
        <div class="absolute-bottom bg-transparent">
          <q-avatar size="56px" class="q-mb-sm">
            <img src="https://cdn.quasar.dev/img/boy-avatar.png" />
          </q-avatar>
        </div>
      </q-img>
    </q-drawer> -->
    <!-- <Sidebar style="background-color: #1d2129"></Sidebar> -->

    <Content></Content>
    <Footer></Footer>
  </q-layout>
  <!-- <RouterView></RouterView> -->
</template>

<style>
.custom-header-dropdown .q-btn-dropdown__arrow-container {
  display: none !important;
}
</style>
