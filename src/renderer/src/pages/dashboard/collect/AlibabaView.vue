<script setup lang="ts">
import { SupplierInfo } from '@shared/SupplierInfo'
import { ref, onMounted, onUnmounted } from 'vue'

const keyword = ref('')
const loading = ref(false)
const progressMessage = ref('')
const suppliers = ref<SupplierInfo[]>([])
const errorMessage = ref('')
const currentPage = ref(0)
const totalPages = ref(0)
const totalFound = ref(0)
const searchMode = ref<'batch' | 'stream'>('stream')

// 搜索函数 - 批量模式
const searchBatch = async (): Promise<void> => {
  console.log('使用批量搜索模式')

  loading.value = true
  errorMessage.value = ''
  progressMessage.value = '正在搜索...'
  suppliers.value = []

  try {
    // 调用主进程的阿里巴巴搜索功能
    const result = await window.electron.alibaba?.searchSuppliers(keyword.value)

    if (result?.success && result.data) {
      suppliers.value = result.data
      totalFound.value = result.data.length
      console.log('批量搜索完成，找到供应商:', suppliers.value.length)
    } else {
      errorMessage.value = result?.error || '搜索失败'
    }
  } catch (error) {
    console.error('批量搜索出错:', error)
    errorMessage.value = '搜索出错: ' + (error instanceof Error ? error.message : String(error))
  } finally {
    loading.value = false
    progressMessage.value = ''
  }
}

// 搜索函数 - 流式模式
const searchStream = async (): Promise<void> => {
  console.log('使用流式搜索模式')

  loading.value = true
  errorMessage.value = ''
  progressMessage.value = '正在初始化...'
  suppliers.value = []
  currentPage.value = 0
  totalPages.value = 0
  totalFound.value = 0

  try {
    // 调用主进程的流式搜索功能
    const result = await window.electron.alibaba?.searchSuppliersStream(keyword.value)

    if (result?.success) {
      console.log('流式搜索启动成功')
    } else {
      errorMessage.value = result?.error || '搜索启动失败'
      loading.value = false
    }
  } catch (error) {
    console.error('流式搜索出错:', error)
    errorMessage.value = '搜索出错: ' + (error instanceof Error ? error.message : String(error))
    loading.value = false
  }
}

// 主搜索函数
const eSearch = async (): Promise<void> => {
  if (!keyword.value.trim()) {
    return
  }

  console.log('搜索关键词:', keyword.value)
  console.log('搜索模式:', searchMode.value)

  if (searchMode.value === 'stream') {
    await searchStream()
  } else {
    await searchBatch()
  }
}

// 取消搜索
const cancelSearch = async (): Promise<void> => {
  try {
    await window.electron.alibaba?.cancelSearch()
    loading.value = false
    progressMessage.value = '搜索已取消'
    console.log('搜索已取消')
  } catch (error) {
    console.error('取消搜索失败:', error)
  }
}

// 监听搜索进度
const handleSearchProgress = (message: string): void => {
  progressMessage.value = message
  console.log('搜索进度:', message)
}

// 监听页面开始
const handleSearchPageStart = (data: { pageNumber: number; message: string }): void => {
  currentPage.value = data.pageNumber
  progressMessage.value = data.message
  console.log('页面开始:', data)
}

// 监听页面完成 - 流式数据处理
const handleSearchPageComplete = (data: {
  suppliers: SupplierInfo[]
  pageNumber: number
  totalFound: number
  message: string
}): void => {
  console.log('页面完成数据:', data)
  console.log('接收到的供应商数量:', data.suppliers.length)
  console.log('当前累计供应商数量:', suppliers.value.length)

  // 数据去重：基于英文名称和URL进行去重
  const existingKeys = new Set(suppliers.value.map((s) => `${s.englishName}-${s.albabaURL}`))

  const newSuppliers = data.suppliers.filter((supplier) => {
    const key = `${supplier.englishName}-${supplier.albabaURL}`
    return !existingKeys.has(key)
  })

  console.log('去重后的新供应商数量:', newSuppliers.length)
  console.log('重复供应商数量:', data.suppliers.length - newSuppliers.length)

  // 将新的供应商数据添加到现有列表中
  suppliers.value.push(...newSuppliers)
  currentPage.value = data.pageNumber
  totalFound.value = data.totalFound
  progressMessage.value = data.message

  console.log('累计供应商数量:', suppliers.value.length)
  console.log('后端报告总数:', data.totalFound)
}

// 监听搜索完成
const handleSearchComplete = (
  data: { totalSuppliers?: number; message: string } | SupplierInfo[]
): void => {
  loading.value = false

  if (Array.isArray(data)) {
    // 批量模式返回的是数组
    suppliers.value = data
    totalFound.value = data.length
    progressMessage.value = `搜索完成，共找到 ${data.length} 个供应商`
  } else {
    // 流式模式返回的是对象
    totalFound.value = data.totalSuppliers || suppliers.value.length
    progressMessage.value = data.message
  }

  console.log('搜索完成:', data)
}

// 监听搜索错误
const handleSearchError = (
  data: { error: string; pageNumber?: number; message: string } | string
): void => {
  if (typeof data === 'string') {
    errorMessage.value = data
  } else {
    errorMessage.value = data.message || data.error
  }

  // 如果是页面级错误，不要停止整个搜索
  if (typeof data === 'object' && data.pageNumber) {
    console.warn(`第 ${data.pageNumber} 页搜索错误:`, data.error)
  } else {
    loading.value = false
    progressMessage.value = ''
  }

  console.error('搜索错误:', data)
}

// 组件挂载时注册事件监听
onMounted(() => {
  window.electron.alibaba?.onSearchProgress(handleSearchProgress)
  window.electron.alibaba?.onSearchPageStart(handleSearchPageStart)
  window.electron.alibaba?.onSearchPageComplete(handleSearchPageComplete)
  window.electron.alibaba?.onSearchComplete(handleSearchComplete)
  window.electron.alibaba?.onSearchError(handleSearchError)
})

// 组件卸载时清理
onUnmounted(() => {
  window.electron.alibaba?.removeAllListeners()
})
</script>

<template>
  <!-- 搜索模式选择 -->
  <div class="q-mb-md">
    <q-btn-toggle
      v-model="searchMode"
      toggle-color="primary"
      :options="[
        { label: '流式搜索', value: 'stream' },
        { label: '批量搜索', value: 'batch' }
      ]"
      class="q-mb-sm"
    />
    <div class="text-caption text-grey-6">
      <span v-if="searchMode === 'stream'">流式搜索：每采集一页立即显示结果，实时反馈进度</span>
      <span v-else>批量搜索：等待所有页面采集完成后统一显示结果</span>
    </div>
  </div>

  <!-- 搜索输入框 -->
  <q-input
    v-model.trim="keyword"
    stack-label
    outlined
    bottom-slots
    label="点击此处输入供应商关键词"
    bg-color="white"
    :readonly="loading"
    :dense="false"
    @keyup.enter="eSearch"
  >
    <template #append>
      <q-btn
        v-if="!loading"
        color="primary"
        icon="search"
        label="查询"
        :disable="loading"
        @click="eSearch"
      />
      <q-btn v-else color="negative" icon="stop" label="取消" @click="cancelSearch" />
    </template>
  </q-input>

  <!-- 进度信息 -->
  <div v-if="loading || progressMessage" class="q-mt-md">
    <q-linear-progress :indeterminate="loading" color="primary" size="4px" class="q-mb-sm" />
    <div class="text-caption text-primary">
      {{ progressMessage || '正在搜索...' }}
    </div>
    <!-- 流式搜索进度详情 -->
    <div v-if="searchMode === 'stream' && (currentPage > 0 || totalFound > 0)" class="q-mt-sm">
      <q-chip v-if="currentPage > 0" color="blue" text-color="white" icon="pages" size="sm">
        第 {{ currentPage }} 页
      </q-chip>
      <q-chip v-if="totalFound > 0" color="green" text-color="white" icon="business" size="sm">
        累计 {{ totalFound }} 个
      </q-chip>
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
  <div v-if="suppliers.length > 0" class="q-mt-md">
    <div class="row q-gutter-sm">
      <q-chip square color="primary" text-color="white" icon="business">
        显示 {{ suppliers.length }} 个供应商
      </q-chip>
      <q-chip
        v-if="totalFound > 0 && totalFound !== suppliers.length"
        square
        color="warning"
        text-color="white"
        icon="warning"
      >
        后端: {{ totalFound }} 个 | 前端: {{ suppliers.length }} 个
      </q-chip>
      <q-chip
        v-if="searchMode === 'stream' && totalFound > suppliers.length"
        square
        color="orange"
        text-color="white"
        icon="pending"
      >
        还在采集中...
      </q-chip>
      <q-chip
        v-if="searchMode === 'stream' && currentPage > 0"
        square
        color="blue"
        text-color="white"
        icon="pages"
      >
        已采集 {{ currentPage }} 页
      </q-chip>
    </div>

    <!-- 供应商列表表格 -->
    <q-markup-table class="q-mt-md">
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
                supplier.website.startsWith('http')
                  ? supplier.website
                  : 'https://' + supplier.website
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
  </div>

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
    <div class="text-body2 text-grey-6">选择搜索模式，输入关键词并点击查询按钮</div>
  </div>
</template>
