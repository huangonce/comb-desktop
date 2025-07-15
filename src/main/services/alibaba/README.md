# 阿里巴巴供应商搜索 - 流式处理

## 概述

AlibabaService 现在支持流式处理模式，每采集完一页就立即返回数据，而不是等所有页面都采集完成后再返回。这样可以：

- 🚀 **提高响应速度** - 立即获得第一页数据
- 📊 **实时进度反馈** - 随时了解采集进度
- 💾 **降低内存使用** - 不需要将所有数据保存在内存中
- 🔄 **支持中断和恢复** - 可以随时停止或处理部分数据

## API 方法

### 1. searchSuppliersStream(keyword, onPageComplete?)

基础流式搜索，返回异步生成器

```typescript
async function example1() {
  const alibabaService = new AlibabaService()

  for await (const pageSuppliers of alibabaService.searchSuppliersStream('laptop')) {
    console.log(`获得一页供应商数据: ${pageSuppliers.length} 个`)
    // 立即处理这批数据
    await processData(pageSuppliers)
  }
}
```

### 2. searchSuppliersWithProgress(keyword, options)

带进度回调的流式搜索，提供更丰富的反馈

```typescript
async function example2() {
  const alibabaService = new AlibabaService()

  for await (const result of alibabaService.searchSuppliersWithProgress('laptop', {
    onPageStart: (pageNumber) => {
      console.log(`开始采集第 ${pageNumber} 页`)
    },
    onPageComplete: (suppliers, pageNumber, totalFound) => {
      console.log(`第 ${pageNumber} 页完成，找到 ${suppliers.length} 个供应商`)
    },
    onError: (error, pageNumber) => {
      console.error(`第 ${pageNumber} 页采集失败: ${error.message}`)
    },
    maxPages: 10
  })) {
    const { suppliers, pageNumber, totalFound } = result
    // 处理数据
  }
}
```

### 3. searchSuppliers(keyword)

兼容性方法，保持原有的批量模式

```typescript
async function example3() {
  const alibabaService = new AlibabaService()

  // 等待所有数据采集完成后返回
  const allSuppliers = await alibabaService.searchSuppliers('laptop')
  console.log(`获得全部供应商: ${allSuppliers.length} 个`)
}
```

## 使用场景

### 场景1: 实时数据处理
```typescript
for await (const pageSuppliers of alibabaService.searchSuppliersStream('laptop')) {
  // 每获得一页数据就立即处理
  await saveToDatabase(pageSuppliers)
  await updateUI(pageSuppliers)
}
```

### 场景2: 进度监控
```typescript
for await (const result of alibabaService.searchSuppliersWithProgress('laptop', {
  onPageComplete: (suppliers, pageNumber, totalFound) => {
    updateProgressBar(pageNumber, totalFound)
  }
})) {
  // 处理数据
}
```

### 场景3: 内存优化
```typescript
// 旧方式 - 所有数据都在内存中
const allSuppliers = await alibabaService.searchSuppliers('laptop') // 可能占用大量内存

// 新方式 - 流式处理，内存占用低
for await (const pageSuppliers of alibabaService.searchSuppliersStream('laptop')) {
  await processAndDiscard(pageSuppliers) // 处理完即可释放内存
}
```

## 最佳实践

1. **使用流式API** 适合大批量数据采集
2. **设置合适的 maxPages** 避免采集过多数据
3. **实现错误处理** 使用 onError 回调处理单页错误
4. **及时处理数据** 不要在内存中累积过多数据
5. **提供用户反馈** 使用进度回调更新UI

## 错误处理

```typescript
try {
  for await (const pageSuppliers of alibabaService.searchSuppliersStream('laptop')) {
    await processData(pageSuppliers)
  }
} catch (error) {
  console.error('搜索失败:', error)
}
```

## 性能优化

- 流式处理避免了内存堆积
- 每页数据立即处理，提高响应速度
- 支持并发控制，避免过度消耗资源
- 自动重试和错误恢复机制
