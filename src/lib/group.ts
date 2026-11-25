/** Cookie that remembers, on this phone, which member ID opened a chit's group link. */
export const groupCookie = (chitId: string) => `chitty_c_${chitId.replace(/-/g, "").slice(0, 16)}`;
