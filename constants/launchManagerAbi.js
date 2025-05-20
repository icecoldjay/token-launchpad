export const abi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_tokenFactory",
        type: "address",
      },
      {
        internalType: "address payable",
        name: "_liquidityManager",
        type: "address",
      },
      {
        internalType: "address",
        name: "_feeCollector",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "_launchFee",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "tokenAddress",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "liquidityTokenId",
        type: "uint256",
      },
    ],
    name: "LaunchCompleted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "holder",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "TokenDistributed",
    type: "event",
  },
  {
    inputs: [],
    name: "feeCollector",
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
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "symbol",
            type: "string",
          },
          {
            internalType: "uint8",
            name: "decimals",
            type: "uint8",
          },
          {
            internalType: "uint256",
            name: "totalSupply",
            type: "uint256",
          },
          {
            internalType: "address[]",
            name: "initialHolders",
            type: "address[]",
          },
          {
            internalType: "uint256[]",
            name: "initialAmounts",
            type: "uint256[]",
          },
          {
            internalType: "bool",
            name: "enableAntiBot",
            type: "bool",
          },
        ],
        internalType: "struct LaunchManager.TokenParams",
        name: "tokenParams",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "uint256",
            name: "tokenAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "ethAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tokenAmountMin",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "ethAmountMin",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "lockDuration",
            type: "uint256",
          },
        ],
        internalType: "struct LaunchManager.EthPairParams",
        name: "ethParams",
        type: "tuple",
      },
    ],
    name: "instantLaunchWithEth",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "string",
            name: "name",
            type: "string",
          },
          {
            internalType: "string",
            name: "symbol",
            type: "string",
          },
          {
            internalType: "uint8",
            name: "decimals",
            type: "uint8",
          },
          {
            internalType: "uint256",
            name: "totalSupply",
            type: "uint256",
          },
          {
            internalType: "address[]",
            name: "initialHolders",
            type: "address[]",
          },
          {
            internalType: "uint256[]",
            name: "initialAmounts",
            type: "uint256[]",
          },
          {
            internalType: "bool",
            name: "enableAntiBot",
            type: "bool",
          },
        ],
        internalType: "struct LaunchManager.TokenParams",
        name: "tokenParams",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "address",
            name: "pairToken",
            type: "address",
          },
          {
            internalType: "uint256",
            name: "tokenAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "pairAmount",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "tokenAmountMin",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "pairAmountMin",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "lockDuration",
            type: "uint256",
          },
        ],
        internalType: "struct LaunchManager.TokenPairParams",
        name: "pairParams",
        type: "tuple",
      },
    ],
    name: "instantLaunchWithToken",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "launchCommits",
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
    inputs: [],
    name: "launchFee",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidityManagerAddress",
    outputs: [
      {
        internalType: "address payable",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "tokenFactory",
    outputs: [
      {
        internalType: "contract TokenFactory",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];
