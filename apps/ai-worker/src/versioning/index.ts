/**
 * Versioning Module - Chain Version Loading
 *
 * Task: IFC-086 - Model Versioning with Zep
 */

export * from './version-loader';
export {
  configureVersionLoader,
  configureVersionLoaderFromPrisma,
  getVersionLoader,
  CHAIN_TYPE_MAP,
} from './chain-version-loader';
export type { WorkerChainKey } from './chain-version-loader';
