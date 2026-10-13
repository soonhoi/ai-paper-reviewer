const { readFile, writeFile, mkdir, unlink, rename, stat } = require("node:fs/promises");
const { join } = require("node:path");

function validateApiKey(key) {
  if (typeof key !== "string" || !key.trim()) throw new Error("OpenAI API Key를 입력해 주세요.");
  const value = key.trim();
  if (!/^sk-[A-Za-z0-9_-]{16,512}$/.test(value)) throw new Error("OpenAI API Key 형식을 확인해 주세요.");
  return value;
}

// The store never logs or returns a decrypted key to the renderer.
function createApiKeyStore({ safeStorage, userData }) {
  const path = join(userData, "api-key.dat");
  let currentKey = null;
  async function encrypt(value) {
    if (typeof safeStorage.encryptStringAsync === "function") {
      if (safeStorage.isAsyncEncryptionAvailable && !await safeStorage.isAsyncEncryptionAvailable()) throw new Error("암호화 저장소를 사용할 수 없습니다.");
      return safeStorage.encryptStringAsync(value);
    }
    if (!safeStorage.isEncryptionAvailable()) throw new Error("암호화 저장소를 사용할 수 없습니다.");
    return safeStorage.encryptString(value);
  }
  async function writeEncrypted(value) {
    const encrypted = await encrypt(value);
    if (!Buffer.isBuffer(encrypted)) throw new Error("암호화 저장 실패");
    await mkdir(userData, { recursive: true });
    const temp = `${path}.tmp`;
    try { await writeFile(temp, encrypted); await rename(temp, path); }
    finally { await unlink(temp).catch(() => {}); }
  }
  return {
    async hasStoredApiKey() {
      try { return (await stat(path)).isFile(); }
      catch (error) { if (error.code === "ENOENT") return false; throw new Error("저장된 Key 상태를 확인하지 못했습니다."); }
    },
    async useKey(input, remember) {
      if (typeof remember !== "boolean") throw new Error("Key 저장 옵션이 잘못되었습니다.");
      if (input) {
        const value = validateApiKey(input);
        if (remember) await writeEncrypted(value);
        else await unlink(path).catch((error) => { if (error.code !== "ENOENT") throw new Error("저장된 Key 삭제 실패"); });
        currentKey = value;
      } else if (!currentKey) {
        let encrypted;
        try { encrypted = await readFile(path); }
        catch { throw new Error("OpenAI API Key를 입력해 주세요."); }
        try {
          const decrypted = typeof safeStorage.decryptStringAsync === "function"
            ? await safeStorage.decryptStringAsync(encrypted) : safeStorage.decryptString(encrypted);
          currentKey = validateApiKey(typeof decrypted === "string" ? decrypted : decrypted.result);
          if (decrypted.shouldReEncrypt) await writeEncrypted(currentKey);
        } catch { throw new Error("저장된 API Key를 읽지 못했습니다. 삭제 후 다시 입력해 주세요."); }
      }
      if (!remember) await unlink(path).catch((error) => { if(error.code!=="ENOENT")throw new Error("저장된 Key 삭제 실패"); });
      return currentKey;
    },
    async deleteStoredApiKey() {
      currentKey = null;
      try { await unlink(path); }
      catch (error) { if (error.code !== "ENOENT") throw new Error("저장된 API Key 삭제 실패"); }
    },
    clearMemory() { currentKey = null; },
  };
}

exports.createApiKeyStore = createApiKeyStore;
exports.validateApiKey = validateApiKey;
