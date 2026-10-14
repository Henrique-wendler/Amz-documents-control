/** Read AAL only after the exact token has passed Supabase Auth getUser(token). */
export const verifiedJwtHasAal2 = (verifiedToken: string): boolean => {
  try {
    const encoded = verifiedToken.split(".")[1];
    if (!encoded) return false;
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as Record<string, unknown>;
    return claims.aal === "aal2";
  } catch {
    return false;
  }
};
