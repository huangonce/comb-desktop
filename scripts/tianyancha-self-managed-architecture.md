# 天眼查服务自管理浏览器实例演示

## 架构改进说明

天眼查服务现在实现了自管理浏览器实例架构，解决了之前的问题并提供了更好的登录状态管理。

### 架构对比

#### 旧架构 - 外部依赖
```typescript
const browserService = new BrowserService()
const tianyancha = new TianyanchaService(browserService)

// 问题：
// - 登录状态容易受到主浏览器实例操作影响
// - 资源管理复杂，需要外部协调
// - 登录窗口可能被主流程干扰
// - 浏览器间歇性出现问题
```

#### 新架构 - 自我管理
```typescript
const tianyancha = new TianyanchaService()

// 优势：
// - 独立浏览器实例，完全隔离
// - 持久化页面保持登录状态
// - 自动资源管理和清理
// - 更好的登录状态共享
// - 解决浏览器间歇性出现问题
```

### 主要改进

#### 1. 独立浏览器实例
- 天眼查服务现在创建并管理自己的浏览器实例
- 完全独立于主采集流程的浏览器
- 专门为天眼查优化的配置（不阻止域名，只阻止图片和字体）

#### 2. 持久化页面管理
```typescript
// 内部实现持久化页面ID
private persistentPageId: string | null = null

// 获取或创建持久化页面
private async getPersistentPage(): Promise<{ page: Page; pageId: string }>
```

#### 3. 更好的登录状态共享
- 持久化页面在多次操作间保持登录状态
- 登录信息缓存机制（24小时有效期）
- 自动登录状态检查和恢复

#### 4. 自动资源管理
```typescript
// 新增的清理方法
async cleanup(): Promise<void> {
  // 清理持久化页面
  // 关闭专用浏览器实例
  // 清除登录信息缓存
}
```

### 使用方式

#### 在 AlibabaService 中的集成
```typescript
export class AlibabaService {
  private tianyanchaService: TianyanchaService

  constructor(ocrService?: OcrService) {
    this.browserService = new BrowserService()
    // 天眼查服务现在自管理，不需要传入浏览器服务
    this.tianyanchaService = new TianyanchaService()
    this.ocrService = ocrService || null
  }

  // 搜索前自动检查天眼查登录状态
  async searchSuppliersStream(query: string, options?: SearchOptions) {
    // 确保天眼查已登录
    const tianyanchaReady = await this.tianyanchaService.ensureLoggedIn()
    if (!tianyanchaReady) {
      throw new Error('天眼查登录失败，无法继续搜索')
    }

    // 继续执行搜索...
  }
}
```

#### 公共方法
```typescript
// 检查登录状态
const isLoggedIn = await alibabaService.getTianyanchaLoginStatus()

// 手动触发登录
const loginSuccess = await alibabaService.loginTianyancha()

// 清除登录缓存
alibabaService.clearTianyanchaLogin()
```

### 解决的问题

#### ✅ 浏览器间歇性出现问题
- **问题**: 执行完采集后，内部的chromium浏览器会每隔一段时间出现，又立马结束
- **解决**: 通过独立浏览器实例和持久化页面管理，彻底隔离了天眼查操作和主采集流程

#### ✅ 登录状态不稳定
- **问题**: 登录状态容易被主流程操作影响
- **解决**: 专用浏览器实例确保登录状态不受干扰

#### ✅ 资源管理复杂
- **问题**: 需要外部协调多个服务的资源管理
- **解决**: 每个服务自管理资源，简化了整体架构

#### ✅ 登录信息共享不佳
- **问题**: 多次操作需要重复登录检查
- **解决**: 持久化页面和登录信息缓存提供更好的共享机制

### 性能优化

1. **专用配置**: 为天眼查优化的浏览器配置
   - `headless: false` - 支持用户交互登录
   - 阻止图片和字体加载提高性能
   - 不阻止任何域名确保登录功能正常

2. **智能缓存**: 24小时登录信息缓存
   - 减少不必要的登录状态检查
   - 自动过期和刷新机制

3. **资源复用**: 持久化页面避免重复创建
   - 同一页面实例用于多次操作
   - 减少页面创建和销毁开销

### 测试建议

1. **登录持久性测试**
   ```typescript
   const tianyancha = new TianyanchaService()

   // 第一次检查 - 应该触发登录
   await tianyancha.ensureLoggedIn()

   // 第二次检查 - 应该使用缓存
   await tianyancha.checkLoginStatus()

   // 清理测试
   await tianyancha.cleanup()
   ```

2. **隔离性测试**
   ```typescript
   const alibaba = new AlibabaService()
   const tianyancha = new TianyanchaService()

   // 确保两个服务的浏览器实例完全独立
   // 天眼查操作不应影响阿里巴巴采集
   ```

这个新架构提供了更稳定、更高效的天眼查登录管理，完全解决了浏览器间歇性出现的问题，并为未来的扩展提供了良好的基础。
