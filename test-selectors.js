// 测试新的选择器
const { chromium } = require('playwright')

async function testNewSelectors() {
  console.log('测试新的选择器...')

  let browser
  try {
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })

    const page = await browser.newPage()

    await page.setExtraHTTPHeaders({
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    await page.setViewportSize({ width: 1920, height: 1080 })

    const searchUrl =
      'https://www.alibaba.com/trade/search?spm=a2700.galleryofferlist.page-tab-top.2.3f2513a0vdk0fb&fsb=y&IndexArea=product_en&SearchText=guangzhou+furniture&tab=supplier'

    await page.goto(searchUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    })

    console.log('页面加载完成，等待内容...')
    await page.waitForTimeout(10000)

    // 测试我们的主要选择器
    const mainSelector =
      'div[class*="card"]:not([class*="factory-card"]):not([class*="product-slider-card"])'
    const cards = await page.locator(mainSelector).count()
    console.log(`找到 ${cards} 个主要卡片`)

    if (cards > 0) {
      // 分析前5个卡片
      const maxCards = Math.min(cards, 5)

      for (let i = 0; i < maxCards; i++) {
        console.log(`\\n=== 分析第 ${i + 1} 个卡片 ===`)
        const card = page.locator(mainSelector).nth(i)

        // 获取整个卡片的文本
        const fullText = await card.textContent()
        console.log('卡片完整文本:', fullText?.slice(0, 200) + '...')

        // 尝试不同的标题选择器
        const titleSelectors = [
          '.cardList--card_title--1fpRTQS',
          'h3',
          'h4',
          'h2',
          '.title',
          'a[title]',
          '[class*="title"]',
          '[class*="name"]'
        ]

        for (const selector of titleSelectors) {
          const titleElement = card.locator(selector).first()
          const titleText = await titleElement.textContent().catch(() => null)
          if (titleText && titleText.trim()) {
            console.log(`  标题 (${selector}): ${titleText.trim()}`)
            break
          }
        }

        // 查找链接
        const links = await card.locator('a').count()
        if (links > 0) {
          const firstLink = await card
            .locator('a')
            .first()
            .getAttribute('href')
            .catch(() => null)
          console.log(`  链接: ${firstLink}`)
        }
      }
    }

    // 特别检查卡片列表
    const cardListSelector = '.cardList--card--rOvbHCM'
    const cardListCount = await page.locator(cardListSelector).count()
    console.log(`\\n特定卡片类 ${cardListSelector}: ${cardListCount} 个`)

    if (cardListCount > 0) {
      const firstCardList = page.locator(cardListSelector).first()
      const cardListText = await firstCardList.textContent()
      console.log('第一个特定卡片文本:', cardListText?.slice(0, 300) + '...')
    }
  } catch (error) {
    console.error('测试失败:', error)
  } finally {
    if (browser) {
      setTimeout(async () => {
        await browser.close()
      }, 5000) // 5秒后关闭，让我们有时间查看
    }
  }
}

testNewSelectors()
