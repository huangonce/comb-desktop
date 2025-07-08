<script setup lang="ts">
import { SupplierInfo } from 'src/shared/SupplierInfo'
import { ref, onMounted, onUnmounted } from 'vue'

const keyword = ref('')
const loading = ref(false)
const progressMessage = ref('')
const suppliers = ref<SupplierInfo[]>([])
const errorMessage = ref('')

// 搜索函数
const eSearch = async (): Promise<void> => {
  if (!keyword.value.trim()) {
    return
  }

  console.log('搜索关键词:', keyword.value)

  loading.value = true
  errorMessage.value = ''
  progressMessage.value = '正在搜索...'
  suppliers.value = []

  try {
    // 调用主进程的阿里巴巴搜索功能
    const result = await window.electron.alibaba?.searchSuppliers(keyword.value)

    if (result?.success && result.data) {
      suppliers.value = result.data
      console.log('搜索完成，找到供应商:', suppliers.value.length)
    } else {
      errorMessage.value = result?.error || '搜索失败'
    }
  } catch (error) {
    console.error('搜索出错:', error)
    errorMessage.value = '搜索出错: ' + (error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = false
    progressMessage.value = ''
  }
}

// 监听搜索进度
const handleSearchProgress = (message: string): void => {
  progressMessage.value = message
  console.log('搜索进度:', message)
}

// 监听搜索完成
const handleSearchComplete = (data: SupplierInfo[]): void => {
  suppliers.value = data
  loading.value = false
  progressMessage.value = ''
  console.log('搜索完成，收到供应商数据:', data.length)
}

// 监听搜索错误
const handleSearchError = (error: string): void => {
  errorMessage.value = error
  loading.value = false
  progressMessage.value = ''
  console.error('搜索错误:', error)
}

// 组件挂载时注册事件监听
onMounted(() => {
  window.electron.alibaba?.onSearchProgress(handleSearchProgress)
  window.electron.alibaba?.onSearchComplete(handleSearchComplete)
  window.electron.alibaba?.onSearchError(handleSearchError)
})

// 组件卸载时清理
onUnmounted(() => {
  // 注意：这里可能需要根据具体的API来清理监听器
  // window.electron.alibaba?.removeAllListeners()
})
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
    @keyup.enter="eSearch"
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

  <!-- 进度信息 -->
  <div v-if="loading || progressMessage" class="q-mt-md">
    <q-linear-progress :indeterminate="loading" color="primary" size="4px" class="q-mb-sm" />
    <div class="text-caption text-primary">
      {{ progressMessage || '正在搜索...' }}
    </div>
  </div>

  <!-- 错误信息 -->
  <q-banner v-if="errorMessage" class="bg-red text-white q-mt-md" dense>
    <template #avatar>
      <q-icon name="error" color="white" />
    </template>
    {{ errorMessage }}
    <template #action>
      <q-btn flat color="white" label="关闭" @click="errorMessage = ''" />
    </template>
  </q-banner>

  <!-- 搜索结果统计 -->
  <div v-if="suppliers.length > 0" class="q-mt-md q-mb-sm">
    <q-chip color="primary" text-color="white" icon="business">
      找到 {{ suppliers.length }} 个供应商
    </q-chip>
  </div>

  <!-- 供应商列表表格 -->
  <q-markup-table v-if="suppliers.length > 0" class="q-mt-md">
    <thead>
      <tr class="bg-grey-3">
        <th class="text-left">序号</th>
        <th class="text-left">中文名称</th>
        <th class="text-left">英文名称</th>
        <th class="text-left">电话</th>
        <th class="text-left">邮箱</th>
        <th class="text-left">国家</th>
        <th class="text-left">省份</th>
        <th class="text-left">城市</th>
        <th class="text-left">地址</th>
        <th class="text-left">官网</th>
        <th class="text-left">成立年份</th>
        <th class="text-left">信用码</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="supplier in suppliers" :key="supplier.id">
        <td class="text-left">{{ supplier.id }}</td>
        <td class="text-left">{{ supplier.chineseName || '-' }}</td>
        <td class="text-left">
          <a :href="supplier.albabaURL" target="_blank">
            {{ supplier.englishName || '-' }}
          </a>
        </td>
        <td class="text-left">{{ supplier.phone || '-' }}</td>
        <td class="text-left">{{ supplier.email || '-' }}</td>
        <td class="text-left">{{ supplier.country || '-' }}</td>
        <td class="text-left">{{ supplier.province || '-' }}</td>
        <td class="text-left">{{ supplier.city || '-' }}</td>
        <td class="text-left">{{ supplier.address || '-' }}</td>
        <td class="text-left">
          <a
            v-if="supplier.website"
            :href="
              supplier.website.startsWith('http') ? supplier.website : 'https://' + supplier.website
            "
            target="_blank"
            class="text-primary"
          >
            {{ supplier.website }}
          </a>
          <span v-else>-</span>
        </td>
        <td class="text-left">{{ supplier.establishedYear || '-' }}</td>
        <td class="text-left">{{ supplier.creditCode || '-' }}</td>
      </tr>
    </tbody>
  </q-markup-table>

  <!-- 空状态 -->
  <div v-else-if="!loading && keyword && !errorMessage" class="text-center q-mt-xl q-pt-xl">
    <q-icon name="search_off" size="64px" color="grey-5" />
    <div class="text-h6 text-grey-8 q-mt-md">未找到相关供应商</div>
    <div class="text-body2 text-grey-6">请尝试使用其他关键词搜索</div>
  </div>

  <!-- 初始状态 -->
  <div v-else-if="!loading && !keyword" class="text-center q-mt-xl q-pt-xl">
    <q-icon name="search" size="64px" color="grey-5" />
    <div class="text-h6 text-grey-8 q-mt-md">开始搜索阿里巴巴供应商</div>
    <div class="text-body2 text-grey-6">输入关键词并点击查询按钮</div>
  </div>
</template>
