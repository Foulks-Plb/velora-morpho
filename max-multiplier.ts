function maxMultiplier(LTV, LLTV, slippage) {
  if (LTV >= LLTV || 1 + slippage <= LLTV) return 1;
  return (1 + slippage - LTV) / (1 + slippage - LLTV);
}

/* Exemple */
console.log(maxMultiplier(0.0, 0.7, 0.0).toFixed(2));
