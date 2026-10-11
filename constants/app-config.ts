import { AppIdentity, createSolanaMainnet, SolanaCluster } from '@wallet-ui/react-native-kit'

export class AppConfig {
  static identity: AppIdentity = { name: 'StockPass', uri: 'https://github.com/Alpha007-ai-dev/stockpass' }
  static networks: SolanaCluster[] = [createSolanaMainnet({ url: 'https://api.mainnet-beta.solana.com' })]
}
