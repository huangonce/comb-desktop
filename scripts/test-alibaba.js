// 简单的测试脚本来验证阿里巴巴服务
const { chromium } = require('playwright')

async function testAlibabaService() {
  console.log('开始测试阿里巴巴服务...')

  let browser
  try {
    // 启动浏览器
    browser = await chromium.launch({
      headless: false, // 显示浏览器窗口用于调试
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })

    const page = await browser.newPage()

    // 设置用户代理
    await page.setExtraHTTPHeaders({
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    // 设置视口
    await page.setViewportSize({ width: 1920, height: 1080 })

    // 访问阿里巴巴搜索页面
    const searchUrl =
      'https://www.alibaba.com/trade/search?spm=a2700.galleryofferlist.page-tab-top.2.3f2513a0vdk0fb&fsb=y&IndexArea=product_en&SearchText=guangzhou+furniture&tab=supplier'
    console.log('访问URL:', searchUrl)

    await page.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    })

    console.log('页面加载完成，等待内容...')
    await page.waitForTimeout(5000)

    // 获取页面标题
    const title = await page.title()
    console.log('页面标题:', title)

    // 尝试找到供应商卡片
    const cardSelectors = [
      '.company-card',
      '.supplier-card',
      '.supplier-info',
      '[data-testid*="supplier"]',
      '.app-supplier-card',
      '.organic-offer-wrapper',
      '.card-info'
    ]

    let found = false
    for (const selector of cardSelectors) {
      const elements = await page.locator(selector).count()
      if (elements > 0) {
        console.log(`找到 ${elements} 个 "${selector}" 元素`)
        found = true

        // 尝试提取第一个元素的文本
        const firstElement = page.locator(selector).first()
        const text = await firstElement.textContent().catch(() => '无法获取文本')
        console.log('第一个元素的文本:', text.slice(0, 200) + '...')
        break
      }
    }

    if (!found) {
      console.log('未找到预期的供应商卡片元素')

      // 获取页面的HTML内容片段用于调试
      const bodyText = await page.locator('body').textContent()
      console.log('页面内容片段:', bodyText.slice(0, 500) + '...')
    }

    console.log('测试完成')
  } catch (error) {
    console.error('测试失败:', error)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// 运行测试
testAlibabaService()
