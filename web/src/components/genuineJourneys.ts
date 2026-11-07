import {
  completedPaymentHref,
  completedPaymentId,
  completedPaymentTerms,
} from "../lib/completedPayment";

// Navigation and archived receipt references only, sourced from audits 27 and 31.
// These never seed order history, supply missing URL terms, or replace live reads.
export const completedPaymentReceipts = [
  [
    "Agreement created",
    "0x057a937ac93132743a53276eefcd7023d3ae72210410fbcee6dc6fdf4fb84567",
  ],
  [
    "Exact USDC allowance",
    "0x7807edd5f7838a287a8723268b0f5b3aba7d7e87a44a87a032ccb6359b7b7133",
  ],
  [
    "Payment terms preapproved",
    "0x3bdd6c65eea5c193abc0dce78b0a92314d459f9cfb38615469977977652ee62c",
  ],
  [
    "USDC reserved",
    "0xcb162300071bc1ae68e081045050fd50d495de93d7651dfc45fe291b4912802b",
  ],
  [
    "Seller acknowledgment",
    "0x2dec3e64944f1bc6db00051079e8f86edf671d454de99977cdacf3a8b081e0c0",
  ],
  [
    "Buyer release",
    "0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023",
  ],
] as const;
export const returnedPaymentId =
  "0xbcb5e97254ce461b35efa91372f2d104f0f71c71ab5abff4f374ec36df4397d0";
export const returnedPaymentTerms =
  "Dealza Checkpoint 8: buyer dispute and reviewer return; controlled test, no physical delivery.";
export const returnedPaymentHref = `#/order/${returnedPaymentId}?terms=${encodeURIComponent(returnedPaymentTerms)}`;
export const returnedPaymentReceipts = [
  [
    "Agreement created",
    "0xfa9c7845e4d5da67b9da3f82ef82c964f681c121e398fb2eb497564e08fba390",
  ],
  [
    "Exact USDC allowance",
    "0x3f9e2f6a633c1d878f4542ee542df298cb117087e7c2b2bb16d1da22d170c664",
  ],
  [
    "Payment terms preapproved",
    "0xef703b1a8350e4d66b9d9ff3c7f34776f38af746f0617b1836aa365b4412259c",
  ],
  [
    "USDC reserved",
    "0x4e3ffff0a2e567effebeb1e6f11c17f19bda00fce9d70e7724efab006df4e9df",
  ],
  [
    "Buyer dispute",
    "0xf1bddacd50bf6cd0cb226fb97ccdd09117750d2a300698472b68e683c26515a6",
  ],
  [
    "Reviewer return",
    "0x3724fb79fef257a8dd5e2168b097755232d5299d90913591bb81d1049fc4e304",
  ],
] as const;
export const genuineJourneys = [
  {
    id: completedPaymentId,
    description: completedPaymentTerms,
    href: completedPaymentHref,
    label: "Buyer released 1 test USDC to the seller",
    receiptLabel: "View buyer release receipt",
    receipts: completedPaymentReceipts,
  },
  {
    id: returnedPaymentId,
    description: returnedPaymentTerms,
    href: returnedPaymentHref,
    label: "Reviewer returned 1 test USDC to the buyer",
    receiptLabel: "View reviewer return receipt",
    receipts: returnedPaymentReceipts,
  },
] as const;
