const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable" });
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[console.error]", msg.text());
  });

  await page.goto("http://localhost:3000/login");
  await page.fill('input[placeholder="superadmin" i]', "owner").catch(async () => {
    // fallback: first text input
    await page.locator("input").first().fill("owner");
  });
  await page.fill('input[type="password"]', "owner123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log("after login url:", page.url());

  // Navigate via sidebar to Settings, then Roles & Permissions
  const settingsLink = page.locator('a[href="/dashboard/settings"]').first();
  if (await settingsLink.count()) {
    await settingsLink.click();
    await page.waitForTimeout(1000);
  }
  await page.goto("http://localhost:3000/dashboard/settings/roles");
  await page.waitForTimeout(1500);
  console.log("roles page url:", page.url());

  await page.screenshot({ path: "/tmp/claude-1000/-home-bek-moil-syntax-offline-cafe-system/11a28e8c-6388-43c7-beb3-e3422a6a48c8/scratchpad/roles_default.png", fullPage: true });

  // Click F&B Manager role button
  const fbBtn = page.locator("button", { hasText: "F&B Manager" });
  if (await fbBtn.count()) {
    await fbBtn.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: "/tmp/claude-1000/-home-bek-moil-syntax-offline-cafe-system/11a28e8c-6388-43c7-beb3-e3422a6a48c8/scratchpad/roles_fbmanager.png", fullPage: true });

  // Find the Inventory row and its Locations popover trigger
  const rows = await page.locator("table tbody tr").all();
  let inventoryRow = null;
  for (const row of rows) {
    const text = await row.innerText();
    if (text.startsWith("Inventory")) { inventoryRow = row; break; }
  }
  if (!inventoryRow) {
    console.log("ERROR: could not find Inventory row");
  } else {
    const trigger = inventoryRow.locator("button", { hasText: /None|All|of/ });
    const triggerText = await trigger.first().innerText();
    console.log("Inventory locations trigger text (expect 'None'):", triggerText);
    await trigger.first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "/tmp/claude-1000/-home-bek-moil-syntax-offline-cafe-system/11a28e8c-6388-43c7-beb3-e3422a6a48c8/scratchpad/roles_popover_open.png", fullPage: true });

    const checkboxLabels = await page.locator('[role="dialog"], .w-64').innerText().catch(() => "");
    console.log("popover content:", checkboxLabels);

    // Check "Bar Counter" checkbox
    const barLabel = page.locator("label", { hasText: "Bar Counter" });
    if (await barLabel.count()) {
      await barLabel.locator('button[role="checkbox"]').click();
      await page.waitForTimeout(300);
    }
    // Close popover by pressing Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const triggerTextAfter = await trigger.first().innerText();
    console.log("Inventory locations trigger text after checking Bar Counter (expect '1 of 2'):", triggerTextAfter);
  }

  // Save
  const saveBtn = page.locator("button", { hasText: "Save changes" });
  await saveBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/claude-1000/-home-bek-moil-syntax-offline-cafe-system/11a28e8c-6388-43c7-beb3-e3422a6a48c8/scratchpad/roles_after_save.png", fullPage: true });

  // Reload and re-check persistence
  await page.reload();
  await page.waitForTimeout(1500);
  const fbBtn2 = page.locator("button", { hasText: "F&B Manager" });
  await fbBtn2.click();
  await page.waitForTimeout(800);
  const rows2 = await page.locator("table tbody tr").all();
  let inventoryRow2 = null;
  for (const row of rows2) {
    const text = await row.innerText();
    if (text.startsWith("Inventory")) { inventoryRow2 = row; break; }
  }
  if (inventoryRow2) {
    const trigger2 = inventoryRow2.locator("button", { hasText: /None|All|of/ });
    const t = await trigger2.first().innerText();
    console.log("After reload, Inventory locations trigger text (expect '1 of 2'):", t);
  }

  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
