<template>
  <q-scroll-area style="height: calc(100% - 98px); margin-top: 98px">
    <q-list>
      <q-item v-ripple clickable to="/dashboard/overview" active-class="text-bold text-primary">
        <q-item-section avatar>
          <q-icon name="dashboard" />
        </q-item-section>

        <q-item-section>仪表盘</q-item-section>
      </q-item>
    </q-list>
    <q-item-label header>基础功能</q-item-label>
    <q-list bordered class="rounded-borders">
      <q-expansion-item icon="catching_pokemon" label="数据采集" default-opened>
        <q-list dense>
          <q-item
            v-ripple
            :inset-level="1"
            clickable
            to="/dashboard/func/alibaba"
            active-class="text-bold text-primary"
          >
            <q-item-section>阿里巴巴国际站</q-item-section>
          </q-item>

          <q-item
            v-ripple
            :inset-level="1"
            clickable
            to="/dashboard/func/made-in-china"
            active-class="text-bold text-primary"
          >
            <q-item-section>中国制造</q-item-section>
          </q-item>
        </q-list>
      </q-expansion-item>
    </q-list>
  </q-scroll-area>
</template>
