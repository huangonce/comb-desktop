const { chromium } = require('playwright-core')

;(async () => {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  console.log('Navigating to example.com')
  await page.goto('https://example.com')

  console.log('Page title:', await page.title())

  await new Promise((resolve) => setTimeout(resolve, 5000))
  await browser.close()
})()
