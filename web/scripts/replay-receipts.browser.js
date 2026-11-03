// Playwright entry point. Run on the local Vite dev server; no network mocking.
// Starts a bounded seven-receipt read-only replay. Inspect window.__dealzaReplay
// until done. Historical expected contexts come from authentic test fixtures;
// canonical receipts/runtime and post-state are fetched live by the real gateway.
async (page) => {
  await page.goto("http://127.0.0.1:5174/");
  return page.evaluate(() => {
    window.__dealzaReplay = { done:false, steps:[], providerRequests:[] };
    (async () => {
      const report = window.__dealzaReplay;
      try {
        const {chainGateway:g} = await import("/src/lib/chainGateway.ts");
        const {stateOf,row,live} = await import("/src/test/helpers/recorded.ts");
        const {default:cancellation} = await import("/src/test/recorded/cancellation.json?import");
        const {beginIntent} = await import("/src/lib/pendingTransaction.ts");
        const {encodeFunctionData,erc20Abi} = await import("/node_modules/.vite/deps/viem.js");
        const {operatorAbi,collectorAbi} = await import("/src/lib/contracts.generated.ts");
        const {descriptionHash} = await import("/src/lib/domain.ts");
        const n=live.addresses;
        const terms={buyer:n.buyer,reviewer:"0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548",amount:1000000n,fundingCutoff:1793725200,expiry:1793898000,description:"Dealza Checkpoint 4: controlled 1 test-USDC checkout"};
        const proof="0xe81e15ba659740bcf8626122f97a3abec2c73ea4833c149f2ff47bc5210dbe82";
        for(const action of ["create","approve","preApprove","fund","delivery","release","cancel"]){
          let before=action==="create"?undefined:stateOf(action==="cancel"?"approve":action,"before");
          if(action==="cancel"){
            const o=cancellation.duplicate.order;
            before={...before,id:cancellation.duplicate.id,order:{...o,status:1,payment:{...o.payment,maxAmount:BigInt(o.payment.maxAmount),salt:BigInt(o.payment.salt)}},derived:1,block:BigInt(cancellation.receipt.blockNumber)-1n};
          }
          const actor=["create","delivery","cancel"].includes(action)?n.seller:n.buyer;
          const target=action==="approve"?n.usdc:action==="preApprove"?n.collector:n.operator;
          const abi=action==="approve"?erc20Abi:action==="preApprove"?collectorAbi:operatorAbi;
          const fn=action==="create"?"createOrder":action==="delivery"?"noteDelivery":action;
          const args=action==="create"?[terms.buyer,terms.amount,terms.fundingCutoff,terms.expiry,terms.reviewer,descriptionHash(terms.description)]:action==="approve"?[n.collector,1000000n]:action==="preApprove"?[before.order.payment]:action==="fund"?[before.id,before.order.payment]:action==="delivery"?[before.id,proof]:[before.id];
          const hash=action==="cancel"?cancellation.receipt.transactionHash:row(action).receipt.transactionHash;
          beginIntent({version:1,actor,operator:n.operator,target,data:encodeFunctionData({abi,functionName:fn,args}),action,before,terms:action==="create"?terms:undefined,proof:action==="create"?descriptionHash(terms.description):proof,hash});
          const session={account:actor,chainId:84532,provider:{request:async({method})=>{report.providerRequests.push(method);if(method==="eth_accounts")return[actor];if(method==="eth_chainId")return"0x14a34";throw Error("Signing, sending and delegation changes forbidden in replay");}}};
          const updates=[];
          const id=await g.resumePending(session,u=>updates.push(u));
          report.steps.push({action,hash,actor,id,updates});
        }
        report.result="PASS";
      }catch(e){report.result="FAIL";report.error=String(e);}
      report.done=true;
    })();
    return {started:true,mode:"READ_ONLY_LIVE_GATEWAY_RECEIPT_REPLAY"};
  });
}
