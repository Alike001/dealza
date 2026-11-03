// Run with Playwright's page after opening the original order and loading older
// activity until the release is visible. Uses the production UI and real reads.
// No wallet connection, signing, writes, or network response mocking.
async (page) => {
  const release =
    "0x63f302e19c08ffae721c7b9705e322eb331132b5216dd05256a6a4789f472c53";
  await page
    .getByRole("link", {
      name: "Release recorded transaction on Base Sepolia explorer (opens a new tab)",
      exact: true,
    })
    .waitFor();
  const layouts = [];
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      unlabelledFields: [
        ...document.querySelectorAll("input,select,textarea"),
      ].filter((el) => !el.labels?.length && !el.getAttribute("aria-label"))
        .length,
    }));
    if (layout.scrollWidth > width || layout.unlabelledFields)
      throw Error("History layout or accessible form labels failed");
    layouts.push(layout);
  }
  const result = await page.evaluate((release) => {
    const body = document.body.innerText;
    const rows = [...document.querySelectorAll(".activity-list li")].map(
      (li) => ({
        text: li.innerText,
        href: li.querySelector("a")?.href,
        label: li.querySelector("a")?.getAttribute("aria-label"),
      }),
    );
    const audit = window.__historyAudit;
    return {
      body,
      rows,
      audit,
      refresh: window.__refreshProof,
      correctReceipt:
        rows.filter(
          (row) => row.href === `https://sepolia.basescan.org/tx/${release}`,
        ).length === 2,
      duplicateRows:
        rows.length !==
        new Set(rows.map((row) => `${row.text}:${row.href}`)).size,
    };
  }, release);
  if (
    !result.correctReceipt ||
    result.duplicateRows ||
    !result.body.includes("Paid to seller") ||
    !result.body.includes("1 USDC") ||
    !result.body.includes("0 USDC")
  )
    throw Error("Incorrect settlement presentation");
  if (
    result.audit &&
    (result.audit.errors.length ||
      result.audit.requests.some(
        (r) => r.blocks > 200 || BigInt(r.from) < 53676176n,
      ))
  )
    throw Error("RPC range or history read failure");
  return {
    result: "PASS",
    mode: "PRODUCTION_PREVIEW_REAL_RPC_READS",
    layouts,
    ...result,
    limitations:
      "Browser viewport emulation only; no physical mobile wallet, wallet signing, live frontend checkout or full accessibility audit.",
  };
}
