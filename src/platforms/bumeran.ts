import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';
import { answerFilterQuestion } from '../services/gemini';

// Apply stealth plugin to playwright
chromium.use(stealthPlugin());

export async function runBumeran(keywords: string[], locations: string[], dryRun: boolean): Promise<void> {
  const domainSuffix = process.env.COUNTRY_DOMAIN || 'com.pe'; // e.g. com.pe, com.ar, cl
  const baseUrl = `https://www.bumeran.${domainSuffix}`;
  const cookiesPath = path.resolve(__dirname, '../../cookies/bumeran.json');
  const screenshotDir = path.resolve(__dirname, '../../logs/bumeran');

  // Verify cookies file exists
  if (!fs.existsSync(cookiesPath)) {
    console.log(`\n[Bumeran] Skipping platform: Session cookies not found at ${cookiesPath}.`);
    console.log('Please log in manually to Bumeran, export your cookies as JSON, and save them there.');
    return;
  }

  console.log(`\n[Bumeran] Starting automated job applications on ${baseUrl}...`);
  fs.mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true, // Run headless for Docker background execution
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  try {
    // Load cookies
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    await context.addCookies(cookies);
    console.log('[Bumeran] Loaded session cookies successfully.');

    const page = await context.newPage();

    for (const keyword of keywords) {
      console.log(`[Bumeran] Searching for: "${keyword}"...`);
      // Bumeran standard search path: baseUrl/empleos-busqueda-keyword.html
      const cleanKeyword = keyword.replace(/\s+/g, '-').toLowerCase();
      const searchUrl = `${baseUrl}/empleos-busqueda-${encodeURIComponent(cleanKeyword)}.html`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // Check login status
      const hasAvatarOrProfile = await page.locator('button[aria-label*="perfil"], div[class*="Avatar"]').first().isVisible().catch(() => false);
      if (!hasAvatarOrProfile) {
        // Fallback check: look for login button
        const loginBtn = await page.locator('text=/ingresar|iniciar sesión/i').first().isVisible().catch(() => false);
        if (loginBtn) {
          console.warn('[Bumeran] Warning: It seems you are not logged in. Your session cookies might have expired.');
        }
      }

      // Collect offer links
      // Typically offers have links containing "/empleos/"
      const offerLinks = await page.evaluate(() => {
        const links: string[] = [];
        const elements = document.querySelectorAll('a[href*="/empleos/"]');
        elements.forEach(el => {
          const href = el.getAttribute('href');
          if (href) {
            // Get absolute URL
            const url = href.startsWith('http') ? href : window.location.origin + href;
            if (!links.includes(url)) {
              links.push(url);
            }
          }
        });
        return links.slice(0, 8); // Process top 8 offers per keyword to respect limits
      });

      console.log(`[Bumeran] Found ${offerLinks.length} potential offers.`);

      for (const link of offerLinks) {
        try {
          console.log(`\n[Bumeran] Opening offer: ${link}`);
          await page.goto(link, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1500);

          const offerTitle = await page.locator('h1').first().textContent().catch(() => 'Unknown Title');
          const companyName = await page.locator('h2').first().textContent().catch(() => 'Unknown Company');

          console.log(`[Bumeran] Title: "${offerTitle?.trim()}" | Company: "${companyName?.trim()}"`);

          // Check if already applied
          const alreadyApplied = await page.locator('text=/ya te postulaste|ya enviado|postulado/i').isVisible();
          if (alreadyApplied) {
            console.log('[Bumeran] [Already Applied] Skipping offer.');
            continue;
          }

          // Locate apply button
          const applyBtn = page.getByRole('button', { name: /postularme|postular/i }).first();
          const applyBtnVisible = await applyBtn.isVisible();

          if (!applyBtnVisible) {
            console.log('[Bumeran] Apply button not found or already applied. Skipping.');
            continue;
          }

          if (dryRun) {
            console.log(`[Bumeran] [DRY RUN] Would click apply on: "${offerTitle?.trim()}"`);
            const safeTitle = (offerTitle || 'offer').replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
            await page.screenshot({ path: path.join(screenshotDir, `dryrun_${safeTitle}.png`) });
            continue;
          }

          // Click Apply
          console.log('[Bumeran] Clicking apply button...');
          await applyBtn.click();
          await page.waitForTimeout(3000);

          // Handle Killer Questions / Filter Questions if they appear
          const hasQuestionsForm = await page.locator('form:has(input, textarea, select)').isVisible();
          if (hasQuestionsForm) {
            console.log('[Bumeran] Killer questions form detected. Answering with Gemini...');

            // Get all fields
            const questionBlocks = await page.locator('form div:has(label, p)').all();

            for (const block of questionBlocks) {
              const labelEl = block.locator('label, p').first();
              const labelText = await labelEl.textContent();

              if (labelText && labelText.trim().length > 3) {
                const questionText = labelText.trim();
                
                const textarea = block.locator('textarea');
                const textInput = block.locator('input[type="text"]');
                const select = block.locator('select');

                if (await textarea.isVisible()) {
                  const answer = await answerFilterQuestion(questionText, `${offerTitle} en ${companyName}`);
                  await textarea.fill(answer);
                  await page.waitForTimeout(1000);
                } else if (await textInput.isVisible()) {
                  const answer = await answerFilterQuestion(questionText, `${offerTitle} en ${companyName}`);
                  await textInput.fill(answer);
                  await page.waitForTimeout(1000);
                } else if (await select.isVisible()) {
                  const options = await select.locator('option').allTextContents();
                  const optionsClean = options.map(o => o.trim()).filter(o => o.length > 0);

                  const prompt = `De las siguientes opciones para la pregunta "${questionText}", ¿cuál es la mejor opción para un perfil con los siguientes datos?\nOpciones: ${optionsClean.join(', ')}`;
                  const answerOption = await answerFilterQuestion(prompt, `${offerTitle} en ${companyName}`);

                  const bestOption = optionsClean.find(opt =>
                    opt.toLowerCase().includes(answerOption.toLowerCase()) ||
                    answerOption.toLowerCase().includes(opt.toLowerCase())
                  ) || optionsClean[0];

                  console.log(`[Bumeran] Select option picked: "${bestOption}" for question "${questionText}"`);
                  await select.selectOption({ label: bestOption });
                  await page.waitForTimeout(1000);
                }
              }
            }

            // Save screenshot of answered questions
            const safeTitle = (offerTitle || 'offer').replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
            await page.screenshot({ path: path.join(screenshotDir, `applied_questions_${safeTitle}.png`) });

            // Click submit
            const submitBtn = page.getByRole('button', { name: /enviar|postular|finalizar/i }).first();
            if (await submitBtn.isVisible()) {
              console.log('[Bumeran] Submitting filter questions...');
              await submitBtn.click();
              await page.waitForTimeout(3000);
            }
          }

          console.log(`[Bumeran] [SUCCESS] Applied to "${offerTitle?.trim()}"`);

        } catch (offerError: any) {
          console.error(`[Bumeran] Error applying to offer ${link}:`, offerError.message);
        }
      }
    }
  } catch (error: any) {
    console.error('[Bumeran] Fatal execution error:', error.message);
  } finally {
    await context.close();
    await browser.close();
    console.log('[Bumeran] Process finished and browser closed.');
  }
}
