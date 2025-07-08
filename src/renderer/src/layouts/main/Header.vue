<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
// const leftDrawerOpen = ref(false)
const pages = ref([
  { name: '阿里巴巴国际站', path: '/dashboard/collect/alibaba' },
  { name: '中国制造', path: '/dashboard/collect/made-in-china' }
])

const handleCheckUpdate = (): void => {
  window.electron.updater?.checkForUpdate()
}
</script>

<template>
  <q-header class="text-white" height-hint="98" style="background-color: #1d2129">
    <q-toolbar class="no-padding">
      <!-- <q-btn flat stretch icon="menu" @click="toggleLeftDrawer" /> -->
      <q-toolbar-title class="q-ml-md">
        <q-img
          src="../../assets/images/logo.png"
          spinner-color="white"
          style="height: 36px; max-width: 36px"
        />
        <span class="text-h6 q-ml-sm"></span>
      </q-toolbar-title>
      <q-space />

      <q-btn-dropdown no-caps flat stretch class="custom-header-dropdown q-mr-md">
        <template #label>
          <q-avatar size="32px">
            <q-img src="../../assets/images/blank.png" />
          </q-avatar>
        </template>

        <div class="row no-wrap q-pa-md items-center q-gutter-sm">
          <div>
            <q-avatar size="50px">
              <q-img src="../../assets/images/blank.png" />
            </q-avatar>
          </div>
          <div>
            <div class="row item-center text-subtitle1 text-bold">
              <div>cnpmjs</div>
              <q-chip square color="primary" size="sm" text-color="white"> 管理员 </q-chip>
            </div>
            <div class="text-grey-6">cnpmjs@once.com</div>
          </div>
        </div>
        <q-separator />
        <q-list dense>
          <q-item v-close-popup clickable>
            <q-item-section avatar>
              <q-avatar icon="lock" size="42px" />
            </q-item-section>
            <q-item-section>
              <q-item-label>修改密码</q-item-label>
            </q-item-section>
          </q-item>
          <q-item v-close-popup clickable>
            <q-item-section avatar>
              <q-avatar icon="update" size="42px" />
            </q-item-section>
            <q-item-section @click="handleCheckUpdate">
              <q-item-label>检查更新</q-item-label>
            </q-item-section>
          </q-item>
          <q-separator />
          <q-item v-close-popup clickable>
            <q-item-section avatar>
              <q-avatar icon="logout" size="42px" />
            </q-item-section>
            <q-item-section>
              <q-item-label>注销登录</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </q-toolbar>

    <q-tabs align="left" class="bg-grey-2 text-grey shadow-1">
      <q-route-tab
        v-for="page in pages"
        :key="page.path"
        :to="page.path"
        :label="page.name"
        :class="{ 'bg-grey-3 text-primary': page.path === route.path }"
      />
    </q-tabs>
  </q-header>
</template>
