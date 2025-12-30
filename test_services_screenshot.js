// Simple screenshot capture for Services page
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Navigate to Services page
    await page.goto('http://localhost:5173/services', {
      waitUntil: 'networkidle2',
      timeout: 10000
    });

    // Wait for content to load
    await page.waitForSelector('h1', { timeout: 5000 });

    // Take screenshots
    await page.screenshot({
      path: '/tmp/services-desktop.png',
      fullPage: true
    });

    // Tablet viewport
    await page.setViewport({ width: 768, height: 1024 });
    await page.screenshot({
      path: '/tmp/services-tablet.png',
      fullPage: true
    });

    // Mobile viewport
    await page.setViewport({ width: 375, height: 812 });
    await page.screenshot({
      path: '/tmp/services-mobile.png',
      fullPage: true
    });

    console.log('Screenshots captured successfully');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
})();
