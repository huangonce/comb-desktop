// 详细的页面结构分析脚本
const { chromium } = require('playwright')

async function analyzePageStructure() {
  console.log('开始分析阿里巴巴页面结构...')

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

    console.log('页面加载完成，等待10秒...')
    await page.waitForTimeout(10000)

    // 获取所有包含类名的元素
    const allElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('*[class]')
      const classNames = new Set()
      elements.forEach((el) => {
        if (el.className && typeof el.className === 'string') {
          el.className.split(' ').forEach((cls) => {
            if (
              cls.trim() &&
              (cls.includes('supplier') || cls.includes('company') || cls.includes('card'))
            ) {
              classNames.add(cls.trim())
            }
          })
        }
      })
      return Array.from(classNames)
    })

    console.log('找到的相关CSS类名:')
    allElements.forEach((cls) => console.log(` - ${cls}`))

    // 查找包含 "supplier" 或 "company" 文本的元素
    const textElements = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false)

      const textNodes = []
      let node
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim()
        if (
          text.length > 10 &&
          (text.toLowerCase().includes('supplier') ||
            text.toLowerCase().includes('company') ||
            text.toLowerCase().includes('manufacturer'))
        ) {
          textNodes.push({
            text: text.slice(0, 100),
            tagName: node.parentElement?.tagName,
            className: node.parentElement?.className
          })
        }
      }
      return textNodes.slice(0, 10) // 只返回前10个
    })

    console.log('\\n找到的相关文本元素:')
    textElements.forEach((item, index) => {
      console.log(`${index + 1}. ${item.tagName}[${item.className}]: ${item.text}`)
    })

    // 等待更长时间让页面完全加载
    console.log('\\n等待页面完全加载...')
    await page.waitForTimeout(5000)

    // 再次检查
    const finalCheck = await page.evaluate(() => {
      const possibleContainers = [
        'div[class*="supplier"]',
        'div[class*="company"]',
        'div[class*="card"]',
        'li[class*="supplier"]',
        'li[class*="company"]',
        'article',
        'section[class*="supplier"]'
      ]

      const results = []
      possibleContainers.forEach((selector) => {
        const elements = document.querySelectorAll(selector)
        if (elements.length > 0) {
          results.push({
            selector,
            count: elements.length,
            firstElementText: elements[0]?.textContent?.slice(0, 100) || 'N/A'
          })
        }
      })
      return results
    })

    console.log('\\n最终检查结果:')
    finalCheck.forEach((result) => {
      console.log(`${result.selector}: ${result.count} 个元素`)
      console.log(`  第一个元素文本: ${result.firstElementText}`)
    })
  } catch (error) {
    console.error('分析失败:', error)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

analyzePageStructure()
