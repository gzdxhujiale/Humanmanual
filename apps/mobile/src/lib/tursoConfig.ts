import * as SecureStore from 'expo-secure-store';

const STORE_KEY_URL = 'turso_url';
const STORE_KEY_TOKEN = 'turso_token';

export async function getTursoConfig() {
  const url = await SecureStore.getItemAsync(STORE_KEY_URL);
  const token = await SecureStore.getItemAsync(STORE_KEY_TOKEN);
  return { url, token };
}

export async function setTursoConfig(url: string, token: string) {
  await SecureStore.setItemAsync(STORE_KEY_URL, url);
  await SecureStore.setItemAsync(STORE_KEY_TOKEN, token);
}

export async function clearTursoConfig() {
  await SecureStore.deleteItemAsync(STORE_KEY_URL);
  await SecureStore.deleteItemAsync(STORE_KEY_TOKEN);
}
