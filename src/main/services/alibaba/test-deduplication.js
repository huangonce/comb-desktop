/**
 * 测试数据一致性问题的修复
 */

// 模拟数据
const mockSuppliersPage1 = [
  { id: 1, englishName: 'Company A', albabaURL: 'https://example.com/a', chineseName: '公司A' },
  { id: 2, englishName: 'Company B', albabaURL: 'https://example.com/b', chineseName: '公司B' },
  { id: 3, englishName: 'Company C', albabaURL: 'https://example.com/c', chineseName: '公司C' }
]

const mockSuppliersPage2 = [
  { id: 4, englishName: 'Company D', albabaURL: 'https://example.com/d', chineseName: '公司D' },
  { id: 5, englishName: 'Company A', albabaURL: 'https://example.com/a', chineseName: '公司A' }, // 重复
  { id: 6, englishName: 'Company E', albabaURL: 'https://example.com/e', chineseName: '公司E' }
]

// 模拟前端去重逻辑
function testDeduplication() {
  console.log('=== 测试去重逻辑 ===')

  let suppliers = []

  // 处理第一页数据
  console.log('处理第一页数据...')
  const existingKeys1 = new Set(suppliers.map((s) => `${s.englishName}-${s.albabaURL}`))
  const newSuppliers1 = mockSuppliersPage1.filter((supplier) => {
    const key = `${supplier.englishName}-${supplier.albabaURL}`
    return !existingKeys1.has(key)
  })
  suppliers.push(...newSuppliers1)
  console.log(`第一页: 接收 ${mockSuppliersPage1.length} 个，去重后添加 ${newSuppliers1.length} 个`)
  console.log(`当前总数: ${suppliers.length}`)

  // 处理第二页数据
  console.log('处理第二页数据...')
  const existingKeys2 = new Set(suppliers.map((s) => `${s.englishName}-${s.albabaURL}`))
  const newSuppliers2 = mockSuppliersPage2.filter((supplier) => {
    const key = `${supplier.englishName}-${supplier.albabaURL}`
    return !existingKeys2.has(key)
  })
  suppliers.push(...newSuppliers2)
  console.log(`第二页: 接收 ${mockSuppliersPage2.length} 个，去重后添加 ${newSuppliers2.length} 个`)
  console.log(`当前总数: ${suppliers.length}`)

  console.log(
    '最终结果:',
    suppliers.map((s) => s.englishName)
  )
  console.log('=== 测试完成 ===')
}

testDeduplication()
