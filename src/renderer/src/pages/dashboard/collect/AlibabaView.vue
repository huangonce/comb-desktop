<script setup lang="ts">
import { ref } from 'vue'

const keyword = ref('')
const loading = ref(false)

const eSearch = (): void => {
  if (!keyword.value.trim()) return

  window.electron.updater?.checkForUpdate()

  console.log('搜索关键词:', keyword.value)

  loading.value = true
  setTimeout(() => {
    loading.value = false
    // 模拟搜索结果处理
    console.log('搜索完成')
  }, 2000) // 模拟2秒的加载时间
}
</script>

<template>
  <q-input
    v-model.trim="keyword"
    stack-label
    outlined
    bottom-slots
    label="点击此处输入供应商关键词"
    bg-color="white"
    :dense="false"
  >
    <template #append>
      <q-btn
        color="primary"
        icon="search"
        label="查询"
        :loading="loading"
        :disable="loading"
        @click="eSearch"
      />
    </template>
  </q-input>

  <q-markup-table>
    <thead>
      <tr>
        <th class="text-left">序号</th>
        <th class="text-left">中文名称</th>
        <th class="text-left">英文名称</th>
        <th class="text-left">电话</th>
        <th class="text-left">座机</th>
        <th class="text-left">国家</th>
        <th class="text-left">省份</th>
        <th class="text-left">城市</th>
        <th class="text-left">地址</th>
        <th class="text-left">联系地址</th>
        <th class="text-left">官网</th>
        <th class="text-left">成立年份</th>
        <th class="text-left">信用码</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="text-left">1</td>
        <td class="text-left">广州名盟家具有限公司</td>
        <td class="text-left">Guangzhou Mingmeng Furniture Co., Ltd.</td>
        <td class="text-left">15812400982</td>
        <td class="text-left">2875921861@qq.com</td>
        <td class="text-left">中国</td>
        <td class="text-left">广东</td>
        <td class="text-left">广州</td>
        <td class="text-left">天河区</td>
        <td class="text-left">广州市天河区沐陂东路7号3楼</td>
        <td class="text-left">www.mingmeng.com</td>
        <td class="text-left">2015-07-10</td>
        <td class="text-left">914401063474284526</td>
      </tr>
    </tbody>
  </q-markup-table>
</template>
