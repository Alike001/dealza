// Generated from pinned Solidity artifacts. Do not edit.
// Sources-SHA256: {"contracts/src/DealzaOperator.sol":"800af315b2f20158827a3b0d812cfcc60fd622eced8b46f7389e381381ab3444","contracts/vendor/commerce-payments/src/AuthCaptureEscrow.sol":"31c6a0c3efec3acacb351e9cefe72b23a56d734474f1785dbf3e4ab45ef1477d","contracts/vendor/commerce-payments/src/collectors/PreApprovalPaymentCollector.sol":"9e03cdbe73ee299e1f2bbb80f61967b90e0ed1a2455c9ba288d571fa10a310c2","contracts/abi/AuthCaptureEscrow.v1.1.0.json":"374b6e02a3a334a617095b2b132b029fd56829d4c64fca0b35f6cf0e21546ef0"}
export const operatorRuntimeHash =
  "0xadbc98ddf155ec9a93328c11d78ff7fe2aeb180cc74bd34222e4313584b2374d" as const;
export const operatorAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "CHAIN_ID",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "COLLECTOR",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract PreApprovalPaymentCollector",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ESCROW",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract AuthCaptureEscrow",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_DURATION",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint48",
        internalType: "uint48",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "USDC",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "cancel",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createOrder",
    inputs: [
      {
        name: "buyer",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint120",
        internalType: "uint120",
      },
      {
        name: "preApprovalExpiry",
        type: "uint48",
        internalType: "uint48",
      },
      {
        name: "expiry",
        type: "uint48",
        internalType: "uint48",
      },
      {
        name: "reviewer",
        type: "address",
        internalType: "address",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "dispute",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "evidenceHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "fund",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "payment",
        type: "tuple",
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        components: [
          {
            name: "operator",
            type: "address",
            internalType: "address",
          },
          {
            name: "payer",
            type: "address",
            internalType: "address",
          },
          {
            name: "receiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "token",
            type: "address",
            internalType: "address",
          },
          {
            name: "maxAmount",
            type: "uint120",
            internalType: "uint120",
          },
          {
            name: "preApprovalExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "authorizationExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "refundExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "minFeeBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "maxFeeBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "feeReceiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "salt",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getOrder",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct DealzaOperator.Order",
        components: [
          {
            name: "payment",
            type: "tuple",
            internalType: "struct AuthCaptureEscrow.PaymentInfo",
            components: [
              {
                name: "operator",
                type: "address",
                internalType: "address",
              },
              {
                name: "payer",
                type: "address",
                internalType: "address",
              },
              {
                name: "receiver",
                type: "address",
                internalType: "address",
              },
              {
                name: "token",
                type: "address",
                internalType: "address",
              },
              {
                name: "maxAmount",
                type: "uint120",
                internalType: "uint120",
              },
              {
                name: "preApprovalExpiry",
                type: "uint48",
                internalType: "uint48",
              },
              {
                name: "authorizationExpiry",
                type: "uint48",
                internalType: "uint48",
              },
              {
                name: "refundExpiry",
                type: "uint48",
                internalType: "uint48",
              },
              {
                name: "minFeeBps",
                type: "uint16",
                internalType: "uint16",
              },
              {
                name: "maxFeeBps",
                type: "uint16",
                internalType: "uint16",
              },
              {
                name: "feeReceiver",
                type: "address",
                internalType: "address",
              },
              {
                name: "salt",
                type: "uint256",
                internalType: "uint256",
              },
            ],
          },
          {
            name: "reviewer",
            type: "address",
            internalType: "address",
          },
          {
            name: "descriptionHash",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "paymentHash",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "status",
            type: "uint8",
            internalType: "enum DealzaOperator.Status",
          },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "noteDelivery",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "evidenceHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "release",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "resolve",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "releaseToSeller",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "decisionHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sellerNonce",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "status",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "enum DealzaOperator.Status",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "syncRecovery",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "DeliveryNoted",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "evidenceHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DisputeOpened",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "by",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "evidenceHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DisputeResolved",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "releaseToSeller",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
      {
        name: "decisionHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderCreated",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "seller",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "buyer",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "reviewer",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "descriptionHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "paymentHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "payment",
        type: "tuple",
        indexed: false,
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        components: [
          {
            name: "operator",
            type: "address",
            internalType: "address",
          },
          {
            name: "payer",
            type: "address",
            internalType: "address",
          },
          {
            name: "receiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "token",
            type: "address",
            internalType: "address",
          },
          {
            name: "maxAmount",
            type: "uint120",
            internalType: "uint120",
          },
          {
            name: "preApprovalExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "authorizationExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "refundExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "minFeeBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "maxFeeBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "feeReceiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "salt",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderFunded",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "paymentHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderReleased",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "authorizedBy",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OrderVoided",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "authorizedBy",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RecoverySynced",
    inputs: [
      {
        name: "orderId",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "Expired",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidConfiguration",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidState",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidTerms",
    inputs: [],
  },
  {
    type: "error",
    name: "PaymentMismatch",
    inputs: [],
  },
  {
    type: "error",
    name: "Reentrancy",
    inputs: [],
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "UnexpectedProtocolState",
    inputs: [],
  },
  {
    type: "error",
    name: "UnknownOrder",
    inputs: [],
  },
] as const;
export const escrowAbi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "uint48",
        name: "timestamp",
        type: "uint48",
      },
      {
        internalType: "uint48",
        name: "expiry",
        type: "uint48",
      },
    ],
    name: "AfterAuthorizationExpiry",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint48",
        name: "timestamp",
        type: "uint48",
      },
      {
        internalType: "uint48",
        name: "expiry",
        type: "uint48",
      },
    ],
    name: "AfterPreApprovalExpiry",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint48",
        name: "timestamp",
        type: "uint48",
      },
      {
        internalType: "uint48",
        name: "expiry",
        type: "uint48",
      },
    ],
    name: "AfterRefundExpiry",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "limit",
        type: "uint256",
      },
    ],
    name: "AmountOverflow",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint48",
        name: "timestamp",
        type: "uint48",
      },
      {
        internalType: "uint48",
        name: "expiry",
        type: "uint48",
      },
    ],
    name: "BeforeAuthorizationExpiry",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "maxAmount",
        type: "uint256",
      },
    ],
    name: "ExceedsMaxAmount",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "feeAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "minFee",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "maxFee",
        type: "uint256",
      },
    ],
    name: "FeeAmountOutOfRange",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "feeBps",
        type: "uint16",
      },
    ],
    name: "FeeBpsOverflow",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "authorizedAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "requestedAmount",
        type: "uint256",
      },
    ],
    name: "InsufficientAuthorization",
    type: "error",
  },
  {
    inputs: [],
    name: "InvalidCollectorForOperation",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint48",
        name: "preApproval",
        type: "uint48",
      },
      {
        internalType: "uint48",
        name: "authorization",
        type: "uint48",
      },
      {
        internalType: "uint48",
        name: "refund",
        type: "uint48",
      },
    ],
    name: "InvalidExpiries",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "minFeeBps",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "maxFeeBps",
        type: "uint16",
      },
    ],
    name: "InvalidFeeBpsRange",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "attempted",
        type: "address",
      },
      {
        internalType: "address",
        name: "expected",
        type: "address",
      },
    ],
    name: "InvalidFeeReceiver",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        internalType: "address",
        name: "expected",
        type: "address",
      },
    ],
    name: "InvalidSender",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
    ],
    name: "PaymentAlreadyCollected",
    type: "error",
  },
  {
    inputs: [],
    name: "Reentrancy",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "refund",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "captured",
        type: "uint256",
      },
    ],
    name: "RefundExceedsCapture",
    type: "error",
  },
  {
    inputs: [],
    name: "TokenCollectionFailed",
    type: "error",
  },
  {
    inputs: [],
    name: "ZeroAmount",
    type: "error",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
    ],
    name: "ZeroAuthorization",
    type: "error",
  },
  {
    inputs: [],
    name: "ZeroFeeReceiver",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        indexed: false,
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "tokenCollector",
        type: "address",
      },
    ],
    name: "PaymentAuthorized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "feeAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "feeReceiver",
        type: "address",
      },
    ],
    name: "PaymentCaptured",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        indexed: false,
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "tokenCollector",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "feeAmount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "feeReceiver",
        type: "address",
      },
    ],
    name: "PaymentCharged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "PaymentReclaimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "address",
        name: "tokenCollector",
        type: "address",
      },
    ],
    name: "PaymentRefunded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "PaymentVoided",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "operator",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "tokenStore",
        type: "address",
      },
    ],
    name: "TokenStoreCreated",
    type: "event",
  },
  {
    inputs: [],
    name: "PAYMENT_INFO_TYPEHASH",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "tokenCollector",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "collectorData",
        type: "bytes",
      },
    ],
    name: "authorize",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "feeAmount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "feeReceiver",
        type: "address",
      },
    ],
    name: "capture",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "tokenCollector",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "collectorData",
        type: "bytes",
      },
      {
        internalType: "uint256",
        name: "feeAmount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "feeReceiver",
        type: "address",
      },
    ],
    name: "charge",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
    ],
    name: "getHash",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "operator",
        type: "address",
      },
    ],
    name: "getTokenStore",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "paymentInfoHash",
        type: "bytes32",
      },
    ],
    name: "paymentState",
    outputs: [
      {
        internalType: "bool",
        name: "hasCollectedPayment",
        type: "bool",
      },
      {
        internalType: "uint120",
        name: "capturableAmount",
        type: "uint120",
      },
      {
        internalType: "uint120",
        name: "refundableAmount",
        type: "uint120",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
    ],
    name: "reclaim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "tokenCollector",
        type: "address",
      },
      {
        internalType: "bytes",
        name: "collectorData",
        type: "bytes",
      },
    ],
    name: "refund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "tokenStoreImplementation",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "operator",
            type: "address",
          },
          {
            internalType: "address",
            name: "payer",
            type: "address",
          },
          {
            internalType: "address",
            name: "receiver",
            type: "address",
          },
          {
            internalType: "address",
            name: "token",
            type: "address",
          },
          {
            internalType: "uint120",
            name: "maxAmount",
            type: "uint120",
          },
          {
            internalType: "uint48",
            name: "preApprovalExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "authorizationExpiry",
            type: "uint48",
          },
          {
            internalType: "uint48",
            name: "refundExpiry",
            type: "uint48",
          },
          {
            internalType: "uint16",
            name: "minFeeBps",
            type: "uint16",
          },
          {
            internalType: "uint16",
            name: "maxFeeBps",
            type: "uint16",
          },
          {
            internalType: "address",
            name: "feeReceiver",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "salt",
            type: "uint256",
          },
        ],
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        name: "paymentInfo",
        type: "tuple",
      },
    ],
    name: "void",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
export const collectorAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "authCaptureEscrow_",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "authCaptureEscrow",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract AuthCaptureEscrow",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "collectTokens",
    inputs: [
      {
        name: "paymentInfo",
        type: "tuple",
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        components: [
          {
            name: "operator",
            type: "address",
            internalType: "address",
          },
          {
            name: "payer",
            type: "address",
            internalType: "address",
          },
          {
            name: "receiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "token",
            type: "address",
            internalType: "address",
          },
          {
            name: "maxAmount",
            type: "uint120",
            internalType: "uint120",
          },
          {
            name: "preApprovalExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "authorizationExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "refundExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "minFeeBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "maxFeeBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "feeReceiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "salt",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "tokenStore",
        type: "address",
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "collectorData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "collectorType",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "enum TokenCollector.CollectorType",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isPreApproved",
    inputs: [
      {
        name: "paymentInfoHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "approved",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "preApprove",
    inputs: [
      {
        name: "paymentInfo",
        type: "tuple",
        internalType: "struct AuthCaptureEscrow.PaymentInfo",
        components: [
          {
            name: "operator",
            type: "address",
            internalType: "address",
          },
          {
            name: "payer",
            type: "address",
            internalType: "address",
          },
          {
            name: "receiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "token",
            type: "address",
            internalType: "address",
          },
          {
            name: "maxAmount",
            type: "uint120",
            internalType: "uint120",
          },
          {
            name: "preApprovalExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "authorizationExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "refundExpiry",
            type: "uint48",
            internalType: "uint48",
          },
          {
            name: "minFeeBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "maxFeeBps",
            type: "uint16",
            internalType: "uint16",
          },
          {
            name: "feeReceiver",
            type: "address",
            internalType: "address",
          },
          {
            name: "salt",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "PaymentPreApproved",
    inputs: [
      {
        name: "paymentInfoHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "AfterPreApprovalExpiry",
    inputs: [
      {
        name: "timestamp",
        type: "uint48",
        internalType: "uint48",
      },
      {
        name: "expiry",
        type: "uint48",
        internalType: "uint48",
      },
    ],
  },
  {
    type: "error",
    name: "InvalidSender",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address",
      },
      {
        name: "expected",
        type: "address",
        internalType: "address",
      },
    ],
  },
  {
    type: "error",
    name: "OnlyAuthCaptureEscrow",
    inputs: [],
  },
  {
    type: "error",
    name: "PaymentAlreadyCollected",
    inputs: [
      {
        name: "paymentInfoHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "PaymentAlreadyPreApproved",
    inputs: [
      {
        name: "paymentInfoHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "PaymentNotPreApproved",
    inputs: [
      {
        name: "paymentInfoHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
    ],
  },
] as const;
