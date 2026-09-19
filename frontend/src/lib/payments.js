export const paymentMethodLabels = {
  FPX: 'FPX Online Banking',
  TNG: 'Touch ’n Go eWallet',
  WALLET: 'reLIVE Wallet',
};

export function checkoutReturnPath(value) {
  return typeof value === 'string' && value.startsWith('/checkout/') ? value : null;
}

export function withReturnPath(path, returnTo) {
  return returnTo ? path + '?returnTo=' + encodeURIComponent(returnTo) : path;
}
