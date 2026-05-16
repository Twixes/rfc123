/** 4-character lowercase alphabetic suffix, e.g. "kxqr". Used to disambiguate
 * RFC branch / file names when they collide with an existing branch or file. */
export function randomSuffix(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += letters[Math.floor(Math.random() * letters.length)];
  }
  return result;
}
