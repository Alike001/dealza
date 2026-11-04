// Run with Playwright against a built local preview. No wallet or signatures.
// Adjust origin if the preview uses another port; screenshots go to new evidence.
async (page) => {
  const origin = "http://127.0.0.1:4174/";
  const output = "docs/verification/public-ui-launch/";
  const results = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["#/", "#/orders", "#/create", "#/help"]) {
      await page.goto(origin + route);
      await page.locator("main").waitFor();
      const result = await page.evaluate(() => ({
        route: location.hash,
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        h1: document.querySelector("h1")?.textContent,
        unlabelledFields: [
          ...document.querySelectorAll("input,textarea,select"),
        ].filter(
          (element) =>
            !element.labels?.length && !element.getAttribute("aria-label"),
        ).length,
        navTouchHeights: [...document.querySelectorAll("nav a")].map(
          (element) => element.getBoundingClientRect().height,
        ),
      }));
      if (result.scrollWidth > width || result.unlabelledFields)
        throw Error("Layout/accessibility failure: " + JSON.stringify(result));
      results.push(result);
      if (route === "#/" && [390, 1440].includes(width))
        await page.screenshot({
          path: output + `landing-${width}.png`,
          fullPage: true,
        });
      if (route === "#/create" && width === 390)
        await page.screenshot({
          path: output + "create-390.png",
          fullPage: true,
        });
      if (route === "#/orders" && width === 1440)
        await page.screenshot({
          path: output + "orders-1440.png",
          fullPage: true,
        });
    }
  }
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.keyboard.press("Escape");
  const walletEscapeFocusReturned = await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .evaluate((element) => element === document.activeElement);
  const terms =
    "Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.";
  const id =
    "0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd";
  await page.goto(origin + `#/order/${id}?terms=${encodeURIComponent(terms)}`);
  await page
    .getByText("Paid to seller", { exact: true })
    .waitFor({ timeout: 45000 });
  const checkout = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      status: document.querySelector(".badge")?.textContent,
      details: document.querySelector(".details")?.innerText,
      terms: document.querySelector(".terms-text")?.textContent,
      signatureButtons: document.querySelectorAll(".action-buttons button")
        .length,
    }));
    if (
      result.scrollWidth > width ||
      result.status !== "Paid to seller" ||
      result.signatureButtons ||
      result.terms !== terms ||
      !result.details.includes("0 USDC") ||
      !result.details.includes("1 USDC")
    )
      throw Error("Checkout regression");
    checkout.push(result);
    if ([390, 1440].includes(width))
      await page.screenshot({
        path: output + `checkout-${width}.png`,
        fullPage: true,
      });
  }
  await page.reload();
  await page
    .getByText("Paid to seller", { exact: true })
    .waitFor({ timeout: 45000 });
  return JSON.stringify({
    result: "PASS",
    origin,
    mode: "production preview, live RPC, no injected wallet",
    results,
    checkout,
    refresh: "PASS",
    walletEscapeFocusReturned,
    pageErrors,
    physicalMobileWalletTested: false,
    signingPerformed: false,
    broadcastPerformed: false,
  });
};
