import type { ComposerInput, ContractCall } from "@/hooks/useTxComposer";

// Renders a copy-paste-ready TypeScript snippet reproducing the composed
// Universal Transaction — init + the exact create*Transaction call, styled
// after Particle's own official quickstart (ethers Wallet + env credentials),
// so it drops into a clean Node/TS project with only credentials substituted.

function functionNameOf(functionAbi: string): string {
  return functionAbi
    .split("(")[0]
    .replace(/^function\s+/, "")
    .trim();
}

function weiValue(value: string): string {
  return value ? BigInt(Math.round(Number(value) * 1e18)).toString() : "0";
}

function encodeCallBlock(call: ContractCall, varName: string): string {
  return `// Encodes: ${call.functionAbi}
const ${varName} = encodeFunctionData({
  abi: parseAbi(["${call.functionAbi}"]),
  functionName: "${functionNameOf(call.functionAbi)}",
  args: [${Object.values(call.argValues)
    .map((v) => JSON.stringify(v))
    .join(", ")}],
});`;
}

export function generateExportSnippet(input: ComposerInput): string {
  const header = `import { UniversalAccount, UNIVERSAL_ACCOUNT_VERSION } from "@particle-network/universal-account-sdk";
import { Wallet, getBytes } from "ethers";

const wallet = new Wallet(process.env.PRIVATE_KEY!);

const ua = new UniversalAccount({
  projectId: process.env.PARTICLE_PROJECT_ID!,
  projectClientKey: process.env.PARTICLE_CLIENT_KEY!,
  projectAppUuid: process.env.PARTICLE_APP_ID!,
  smartAccountOptions: {
    name: "MyApp",
    version: UNIVERSAL_ACCOUNT_VERSION,
    ownerAddress: wallet.address,
    useEIP7702: true,
  },
});`;

  let action: string;
  if (input.mode === "transfer") {
    action = `const transaction = await ua.createTransferTransaction({
  token: { chainId: 42161, address: "${input.tokenAddress}" },
  amount: "${input.amount}",
  receiver: "${input.receiver}",
});`;
  } else if (input.mode === "batch") {
    const blocks = input.calls.map((c, i) => encodeCallBlock(c, `data${i}`)).join("\n\n");
    const txEntries = input.calls
      .map((c, i) => `{ to: "${c.targetAddress}", data: data${i}, value: "${weiValue(c.value)}" }`)
      .join(",\n    ");
    action = `${blocks}

const transaction = await ua.createUniversalTransaction({
  chainId: 42161,
  expectTokens: [],
  transactions: [
    ${txEntries}
  ],
});`;
  } else {
    action = `${encodeCallBlock(input, "data")}

const transaction = await ua.createUniversalTransaction({
  chainId: 42161,
  expectTokens: [],
  transactions: [{ to: "${input.targetAddress}", data, value: "${weiValue(input.value)}" }],
});`;
  }

  const importsForCall =
    input.mode !== "transfer" ? `import { encodeFunctionData, parseAbi } from "viem";\n` : "";

  return `${importsForCall}${header}

${action}

const signature = await wallet.signMessage(getBytes(transaction.rootHash));
const result = await ua.sendTransaction(transaction, signature);
console.log(result);
`;
}
