async (page) => {
  const dir = 'docs/verification/wizard-polish';
  const report = { mode: 'Local Chromium; simulated identity only; all signing/broadcast methods blocked', responsive: [], accessibility: [], keyboard: [], wallet: [] };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const screenshot = async (name, fullPage = true) => page.screenshot({ path: `${dir}/${name}.png`, fullPage });
  await page.addInitScript(() => {
    window.__walletMethods = [];
    window.ethereum = {
      isMetaMask: true,
      request: async ({ method }) => {
        window.__walletMethods.push(method);
        if (['eth_requestAccounts', 'eth_accounts'].includes(method)) return ['0x1111111111111111111111111111111111111111'];
        if (method === 'eth_chainId') return '0x14a34';
        throw new Error(`Blocked wallet method: ${method}`);
      }, on() {}, removeListener() {},
    };
  });
  await page.goto('http://127.0.0.1:5173/#/create');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Connect MetaMask', exact: true }).click();
  await page.getByRole('button', { name: /Wallet connected:/ }).waitFor();
  await page.addScriptTag({ path: '/tmp/dealza-wizard-axe.min.js' });
  const sizes = [[320,740],[390,844],[768,1024],[1440,900]];
  async function inspect(state) {
    for (const [width,height] of sizes) {
      await page.setViewportSize({ width,height });
      await page.evaluate(() => window.scrollTo(0,0));
      const result = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        targets: [...document.querySelectorAll('.wizard-progress button, .order-form .button, .review-panel button, .draft-controls summary')].filter(el=>el.getClientRects().length).map(el=>({label:el.getAttribute('aria-label') || el.textContent.trim(),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),
      }));
      assert(!result.overflow, `${state} overflows at ${width}`);
      assert(result.targets.every(t=>t.height>=44 && t.width>=44), `${state} small touch targets at ${width}`);
      report.responsive.push({ state,width,height,...result });
      const a11y = await page.evaluate(async () => {
        const result = await axe.run(document, { runOnly: {type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']} });
        return { passes:result.passes.length, violations:result.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})), incomplete:result.incomplete.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})) };
      });
      report.accessibility.push({state,width,...a11y});
      assert(a11y.violations.every(v=>v.id==='region' && v.targets.every(t=>t.join('')==='.testnet-bar')), `Unexpected axe violation ${state} ${width}: ${JSON.stringify(a11y.violations)}`);
      await screenshot(`${state}-${width}`);
    }
  }
  async function advance(name,heading) {
    await page.setViewportSize({ width:390,height:844 });
    await page.getByRole('button',{name,exact:true}).focus();
    await page.keyboard.press('Enter');
    const focus = await page.evaluate(()=>({text:document.activeElement.textContent,top:document.activeElement.getBoundingClientRect().top,bottom:document.activeElement.getBoundingClientRect().bottom,scrollY}));
    assert(focus.text===heading && focus.top>=0 && focus.bottom<=844, `Wrong step focus: ${JSON.stringify(focus)}`);
    report.keyboard.push({action:name,...focus});
  }
  await page.getByLabel('What is this order for?').fill('Dealza UX verification: buyer dispute and reviewer return; controlled test, no physical delivery. Long agreement terms remain fully available in the editable details and final review. '.repeat(6));
  await page.getByLabel(/Order amount/).fill('1');
  await page.setViewportSize({width:320,height:740});
  report.longTerms = await page.locator('.draft-preview .terms-text').evaluate(el=>({characters:el.textContent.length,previewHeight:el.clientHeight,fullTextHeight:el.scrollHeight,noHorizontalOverflow:document.documentElement.scrollWidth<=innerWidth}));
  assert(report.longTerms.previewHeight < report.longTerms.fullTextHeight && report.longTerms.noHorizontalOverflow,'Long preview does not truncate safely');
  await screenshot('long-terms-preview-320');
  await page.getByLabel('What is this order for?').fill('Dealza UX verification: buyer dispute and reviewer return; controlled test, no physical delivery.');
  await inspect('details');
  await page.locator('.draft-controls summary').focus();
  await page.keyboard.press('Enter');
  assert(await page.locator('.draft-controls details').evaluate(el=>el.open),'Keyboard draft disclosure did not open');
  await page.keyboard.press('Tab');
  assert(await page.getByRole('button',{name:'Save draft',exact:true}).evaluate(el=>el===document.activeElement),'Draft save tab order');
  await page.keyboard.press('Enter');
  await page.locator('.draft-controls summary').focus();
  await page.keyboard.press('Enter');
  report.keyboard.push({action:'Draft options Enter/Tab/Enter',passed:true});
  await advance('Continue','People involved');
  await page.keyboard.press('Tab');
  assert(await page.getByLabel('Buyer’s wallet address').evaluate(el=>el===document.activeElement),'Buyer focus after heading');
  await page.getByLabel('Buyer’s wallet address').fill('0x2222222222222222222222222222222222222222');
  await page.getByLabel('Agreed reviewer’s wallet address').fill('0x3333333333333333333333333333333333333333');
  await inspect('people');
  await advance('Continue','Payment deadlines');
  const localDate = offset => new Date(Date.now()+offset*86400000).toISOString().slice(0,16);
  await page.getByLabel('Buyer must reserve by').fill(localDate(1));
  await page.getByLabel('Payment release & review deadline').fill(localDate(3));
  assert((await page.getByRole('region',{name:'Agreement summary'}).innerText()).includes('0x3333333333333333333333333333333333333333'),'Reviewer missing from preview');
  await inspect('deadlines');
  await advance('Review order','1 test USDC');
  await inspect('review');
  await advance('Edit People involved','People involved');
  assert(await page.getByLabel('Buyer’s wallet address').inputValue()==='0x2222222222222222222222222222222222222222','Edit lost buyer');
  await advance('Back','Agreement details');
  assert((await page.getByLabel('What is this order for?').inputValue()).startsWith('Dealza UX verification'),'Back lost draft');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();
  await page.getByLabel('Buyer must reserve by').waitFor();
  assert(await page.locator('#review-heading').count()===0,'Restored untrusted review');
  report.recovery = {restoredStage:'Payment deadlines',reviewNotRestored:true};
  await page.addScriptTag({path:'/tmp/dealza-wizard-axe.min.js'});
  for (const [width,height] of [...sizes,[390,400]]) {
    await page.setViewportSize({width,height});
    await page.getByRole('button',{name:/Wallet connected:/}).click();
    const panel = page.getByRole('region',{name:'Wallet connection'});
    const metrics = await panel.evaluate(el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,scrollTop:el.scrollTop,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,headingTop:el.querySelector('h2').getBoundingClientRect().top,headingBottom:el.querySelector('h2').getBoundingClientRect().bottom,overflowX:el.scrollWidth>el.clientWidth}));
    assert(metrics.top>=0 && metrics.bottom<=height && metrics.headingTop>=metrics.top && metrics.headingBottom<=metrics.bottom && !metrics.overflowX && metrics.scrollTop===0,'Wallet initial clipping');
    await screenshot(`wallet-${width}x${height}`,false);
    await page.keyboard.press('Tab');
    assert(await page.getByRole('button',{name:'Close wallet panel'}).evaluate(el=>el===document.activeElement),'Close not first wallet tab target');
    const visited=[];
    for(let i=0;i<8;i++) {
      visited.push(await page.evaluate(()=>({label:document.activeElement.textContent.trim(),inside:!!document.activeElement.closest('#wallet-panel'),top:document.activeElement.getBoundingClientRect().top,bottom:document.activeElement.getBoundingClientRect().bottom})));
      if(visited.at(-1).label==='Disconnect this session') break;
      await page.keyboard.press('Tab');
    }
    assert(visited.at(-1).label==='Disconnect this session' && visited.every(v=>v.inside && v.top>=metrics.top && v.bottom<=metrics.bottom+1),'Wallet keyboard cannot reach all actions');
    const a11y = await page.evaluate(async()=>{const r=await axe.run(document.querySelector('#wallet-panel'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});
    assert(a11y.length===0,`Wallet accessibility: ${JSON.stringify(a11y)}`);
    await screenshot(`wallet-end-${width}x${height}`,false);
    await page.keyboard.press('Escape');
    assert(await page.getByRole('button',{name:/Wallet connected:/}).evaluate(el=>el===document.activeElement),'Wallet Escape lost trigger focus');
    report.wallet.push({width,height,metrics,visited,axeViolations:a11y,escapeRestoresFocus:true});
  }
  report.walletMethods = await page.evaluate(()=>window.__walletMethods);
  assert(report.walletMethods.every(m=>['eth_requestAccounts','eth_accounts','eth_chainId'].includes(m)),'Unexpected wallet operation');
  report.signingPerformed=false;report.broadcastPerformed=false;
  await page.evaluate(report => { window.__polishReport = report; }, report);
  return {responsiveChecks:report.responsive.length,accessibilityChecks:report.accessibility.length,walletChecks:report.wallet.length,keyboard:report.keyboard,recovery:report.recovery};
}
