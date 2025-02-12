import { Provider, Signer, mnemonicToAccount, getWalletPrivateKeys } from '@oyl/sdk';
import * as bitcoin from 'bitcoinjs-lib'
import Drylla from './drylla';
import 'dotenv/config'
import { createLogger } from "./logger";

const logger = createLogger("Drylla");


async function main() {
  try {
    
    const provider = new Provider({
      url: 'https://mainnet.sandshrew.io',
      version: 'v2',
      projectId: process.env.SANDSHREW_PROJECT_ID!,
      network: bitcoin.networks.bitcoin,
      networkType: 'mainnet',
    })

  
    const mnemonic = process.env.WALLET_MNEMONIC;
    if (!mnemonic) {
      throw new Error('WALLET_MNEMONIC environment variable is required');
    }

    const account = await mnemonicToAccount({ 
      mnemonic,
      opts: {
        network: provider.network,
      },
    });

    const privateKeys = getWalletPrivateKeys({
      mnemonic: mnemonic,
      opts: {
        network: account.network,
      },
    })

   
    const signer = new Signer(account.network, {
      taprootPrivateKey: privateKeys.taproot.privateKey,
      segwitPrivateKey: privateKeys.nativeSegwit.privateKey,
      nestedSegwitPrivateKey: privateKeys.nestedSegwit.privateKey,
      legacyPrivateKey: privateKeys.legacy.privateKey,
    })

    const feeMultiplier: number | undefined = process.env.FEE_MULTIPLIER !== undefined ? parseInt(process.env.FEE_MULTIPLIER) : undefined;

 
    const minter = new Drylla(account, provider, signer, feeMultiplier);
    minter.startMinting();

    logger.info('Drylla initialized successfully');

    
    process.on('SIGINT', () => {
      logger.info('Shutting down drylla...');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Error initializing drylla', { error });
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});