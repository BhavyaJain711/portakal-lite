/**
 * Error classes. Copied from portakal (https://github.com/productdevbook/portakal) — MIT.
 */

/** Base error class */
export class PortakalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortakalError";
  }
}

/** Thrown when label configuration or element values are invalid */
export class InvalidConfigError extends PortakalError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConfigError";
  }
}
