/**
 * Import this for its side effect as the first import of a service entry, so the
 * check runs before any other module loads. ES imports evaluate in order.
 */
import { enforceLicenseKey } from './license-check';

enforceLicenseKey();
