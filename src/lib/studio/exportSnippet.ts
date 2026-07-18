import type { ComposerInput } from "@/hooks/useTxComposer";

// Renders a copy-paste-ready TypeScript snippet reproducing the composed
// Universal Transaction — init + the exact create*Transaction call, styled
// after Particle's own official quickstart (ethers Wallet + env credentials),
// so it drops into a clean Node/TS project with only credentials substituted.
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

  const action =
    input.mode === "transfer"
      ? `const transaction = await ua.createTransferTransaction({
  token: { chainId: 42161, address: "${input.tokenAddress}" },
  amount: "${input.amount}",
  receiver: "${input.receiver}",
});`
      : `// Encodes: ${input.functionAbi}
const data = encodeFunctionData({
  abi: parseAbi(["${input.functionAbi}"]),
  functionName: "${input.functionAbi
    .split("(")[0]
    .replace(/^function\s+/, "")
    .trim()}",
  args: [${Object.values(input.argValues)
    .map((v) => JSON.stringify(v))
    .join(", ")}],
});

const transaction = await ua.createUniversalTransaction({
  chainId: 42161,
  expectTokens: [],
  transactions: [{ to: "${input.targetAddress}", data, value: "${
    input.value ? BigInt(Math.round(Number(input.value) * 1e18)).toString() : "0"
  }" }],
});`;

  const importsForCall =
    input.mode === "contract-call" ? `import { encodeFunctionData, parseAbi } from "viem";\n` : "";

  return `${importsForCall}${header}

${action}

const signature = await wallet.signMessage(getBytes(transaction.rootHash));
const result = await ua.sendTransaction(transaction, signature);
console.log(result);
`;
}
