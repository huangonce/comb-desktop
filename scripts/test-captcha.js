// 处理滑动验证的测试脚本
const { chromium } = require('playwright')

async function testWithCaptchaHandling() {
  console.log('开始测试（处理验证码）...')

  let browser
  try {
    browser = await chromium.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor'
      ]
    })

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York'
    })

    // 隐藏webdriver标识
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      })
    })

    const page = await context.newPage()

    // 尝试直接访问供应商页面而不是搜索页面
    console.log('访问阿里巴巴供应商目录页面...')
    await page.goto('https://www.alibaba.com/Suppliers', {
      waitUntil: 'networkidle',
      timeout: 30000
    })

    console.log('页面加载完成，等待内容...')
    await page.waitForTimeout(5000)

    // 检查是否有验证码
    const hasCaptcha =
      (await page
        .locator('iframe[src*="captcha"], .nc_wrapper, [class*="captcha"], [class*="verify"]')
        .count()) > 0

    if (hasCaptcha) {
      console.log('检测到验证码，等待30秒手动处理...')
      console.log('请手动完成验证，脚本会等待...')
      await page.waitForTimeout(30000)
    }

    // 重新检查页面内容
    const title = await page.title()
    console.log('页面标题:', title)

    // 查找供应商相关的元素
    const supplierElements = await page.evaluate(() => {
      // 查找包含供应商信息的常见选择器
      const selectors = [
        '[class*="supplier"]',
        '[class*="company"]',
        '[class*="manufacturer"]',
        '.list-item',
        '.search-item',
        '[data-role*="supplier"]',
        'article',
        '.item'
      ]

      const results = []

      selectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector)
        if (elements.length > 0) {
          const firstText = elements[0]?.textContent?.trim().slice(0, 150) || ''
          if (firstText.length > 20) {
            // 过滤掉太短的内容
            results.push({
              selector,
              count: elements.length,
              sampleText: firstText
            })
          }
        }
      })

      return results
    })

    console.log('\\n找到的供应商相关元素:')
    supplierElements.forEach((item) => {
      console.log(`${item.selector}: ${item.count} 个元素`)
      console.log(`  示例文本: ${item.sampleText}`)
      console.log('---')
    })

    // 尝试分析页面的主要内容结构
    const pageStructure = await page.evaluate(() => {
      const mainContent = document.querySelector('main, #main, .main, .content, [role="main"]')
      if (!mainContent) return { error: '未找到主要内容区域' }

      const childElements = Array.from(mainContent.children)
      return {
        mainContentTag: mainContent.tagName,
        mainContentClass: mainContent.className,
        childrenCount: childElements.length,
        childrenTypes: childElements.slice(0, 5).map((el) => ({
          tag: el.tagName,
          classes: el.className,
          textPreview: el.textContent?.trim().slice(0, 100) || ''
        }))
      }
    })

    console.log('\\n页面结构分析:')
    console.log(JSON.stringify(pageStructure, null, 2))

    console.log('\\n等待10秒后关闭浏览器...')
    await page.waitForTimeout(10000)
  } catch (error) {
    console.error('测试失败:', error)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

testWithCaptchaHandling()
