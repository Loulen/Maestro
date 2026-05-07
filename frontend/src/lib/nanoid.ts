const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ID_LEN = 8;

export function generateNodeId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LEN));
  let id = "";
  for (let i = 0; i < ID_LEN; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}
