"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCompuTrabajo = runCompuTrabajo;
const playwright_extra_1 = require("playwright-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gemini_1 = require("../services/gemini");
// Apply stealth plugin to playwright
playwright_extra_1.chromium.use((0, puppeteer_extra_plugin_stealth_1.default)());
async function runCompuTrabajo(keywords, locations, dryRun) {
    const domainSuffix = process.env.COUNTRY_DOMAIN || 'com.pe'; // e.g. com.pe, com.ar, cl
    const baseUrl = `https://www.computrabajo.${domainSuffix}`;
    const cookiesPath = path.resolve(__dirname, '../../cookies/computrabajo.json');
    const screenshotDir = path.resolve(__dirname, '../../logs/computrabajo');
    // Verify cookies file exists
    if (!fs.existsSync(cookiesPath)) {
        console.log(`\n[CompuTrabajo] Skipping platform: Session cookies not found at ${cookiesPath}.`);
        console.log('Please log in manually to CompuTrabajo, export your cookies as JSON, and save them there.');
        return;
    }
    console.log(`\n[CompuTrabajo] Starting automated job applications on ${baseUrl}...`);
    fs.mkdirSync(screenshotDir, { recursive: true });
    const browser = await playwright_extra_1.chromium.launch({
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
        console.log('[CompuTrabajo] Loaded session cookies successfully.');
        const page = await context.newPage();
        for (const keyword of keywords) {
            console.log(`[CompuTrabajo] Searching for: "${keyword}"...`);
            // Navigate to search URL
            const searchUrl = `${baseUrl}/empleos?q=${encodeURIComponent(keyword)}`;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
            // Check if logged in (if we see profile elements or no "Ingresar" buttons)
            const loginButtonExists = await page.locator('a:has-text("Ingresar")').isVisible();
            if (loginButtonExists) {
                console.warn('[CompuTrabajo] Warning: It seems you are not logged in. Your session cookies might have expired.');
            }
            // Collect offer links
            // Typically offers have links containing "/oferta-de-trabajo-"
            const offerLinks = await page.evaluate(() => {
                const links = [];
                const elements = document.querySelectorAll('a[href*="/oferta-de-trabajo-"]');
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
            console.log(`[CompuTrabajo] Found ${offerLinks.length} potential offers.`);
            for (const link of offerLinks) {
                try {
                    console.log(`\n[CompuTrabajo] Opening offer: ${link}`);
                    await page.goto(link, { waitUntil: 'networkidle' });
                    await page.waitForTimeout(1500);
                    const offerTitle = await page.locator('h1').first().textContent().catch(() => 'Unknown Title');
                    const companyName = await page.locator('a[href*="/empresas/"]').first().textContent().catch(() => 'Unknown Company');
                    console.log(`[CompuTrabajo] Title: "${offerTitle?.trim()}" | Company: "${companyName?.trim()}"`);
                    // Check if already applied
                    const alreadyApplied = await page.locator('text=/ya te postulaste|ya enviado|postulado/i').isVisible();
                    if (alreadyApplied) {
                        console.log('[CompuTrabajo] [Already Applied] Skipping offer.');
                        continue;
                    }
                    // Locate apply button
                    // Find buttons containing postular, enviar cv, etc.
                    const applyBtn = page.getByRole('button', { name: /postularme|enviar mi cv|aplicar/i }).first();
                    const applyBtnVisible = await applyBtn.isVisible();
                    if (!applyBtnVisible) {
                        console.log('[CompuTrabajo] Apply button not found or already applied. Skipping.');
                        continue;
                    }
                    if (dryRun) {
                        console.log(`[CompuTrabajo] [DRY RUN] Would click apply on: "${offerTitle?.trim()}"`);
                        const safeTitle = (offerTitle || 'offer').replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
                        await page.screenshot({ path: path.join(screenshotDir, `dryrun_${safeTitle}.png`) });
                        continue;
                    }
                    // Click Apply
                    console.log('[CompuTrabajo] Clicking apply button...');
                    await applyBtn.click();
                    await page.waitForTimeout(3000);
                    // Handle Killer Questions / Filter Questions if they appear
                    const hasQuestionsForm = await page.locator('form:has(input, textarea, select)').isVisible();
                    if (hasQuestionsForm) {
                        console.log('[CompuTrabajo] Killer questions form detected. Answering with Gemini...');
                        // Get all question blocks or labels
                        const questionBlocks = await page.locator('form div:has(label, p)').all();
                        for (const block of questionBlocks) {
                            const labelEl = block.locator('label, p').first();
                            const labelText = await labelEl.textContent();
                            if (labelText && labelText.trim().length > 3) {
                                const questionText = labelText.trim();
                                // Find input, textarea or select within this block
                                const textarea = block.locator('textarea');
                                const textInput = block.locator('input[type="text"]');
                                const select = block.locator('select');
                                if (await textarea.isVisible()) {
                                    const answer = await (0, gemini_1.answerFilterQuestion)(questionText, `${offerTitle} en ${companyName}`);
                                    await textarea.fill(answer);
                                    await page.waitForTimeout(1000);
                                }
                                else if (await textInput.isVisible()) {
                                    const answer = await (0, gemini_1.answerFilterQuestion)(questionText, `${offerTitle} en ${companyName}`);
                                    await textInput.fill(answer);
                                    await page.waitForTimeout(1000);
                                }
                                else if (await select.isVisible()) {
                                    // For dropdowns, we ask Gemini to pick the best option
                                    const options = await select.locator('option').allTextContents();
                                    const optionsClean = options.map(o => o.trim()).filter(o => o.length > 0);
                                    const prompt = `De las siguientes opciones para la pregunta "${questionText}", ¿cuál es la mejor opción para un perfil con los siguientes datos?\nOpciones: ${optionsClean.join(', ')}`;
                                    const answerOption = await (0, gemini_1.answerFilterQuestion)(prompt, `${offerTitle} en ${companyName}`);
                                    // Try to find matching option value
                                    const bestOption = optionsClean.find(opt => opt.toLowerCase().includes(answerOption.toLowerCase()) ||
                                        answerOption.toLowerCase().includes(opt.toLowerCase())) || optionsClean[0];
                                    console.log(`[CompuTrabajo] Select option picked: "${bestOption}" for question "${questionText}"`);
                                    await select.selectOption({ label: bestOption });
                                    await page.waitForTimeout(1000);
                                }
                            }
                        }
                        // Save screenshot of answered questions for log validation
                        const safeTitle = (offerTitle || 'offer').replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
                        await page.screenshot({ path: path.join(screenshotDir, `applied_questions_${safeTitle}.png`) });
                        // Click submit/continue
                        const submitBtn = page.getByRole('button', { name: /enviar|continuar|finalizar/i }).first();
                        if (await submitBtn.isVisible()) {
                            console.log('[CompuTrabajo] Submitting filter questions...');
                            await submitBtn.click();
                            await page.waitForTimeout(3000);
                        }
                    }
                    console.log(`[CompuTrabajo] [SUCCESS] Applied to "${offerTitle?.trim()}"`);
                }
                catch (offerError) {
                    console.error(`[CompuTrabajo] Error applying to offer ${link}:`, offerError.message);
                }
            }
        }
    }
    catch (error) {
        console.error('[CompuTrabajo] Fatal execution error:', error.message);
    }
    finally {
        await context.close();
        await browser.close();
        console.log('[CompuTrabajo] Process finished and browser closed.');
    }
}
