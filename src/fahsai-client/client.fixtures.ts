import type { FahsaiClient } from './client.js';

export function fakeClient(get: FahsaiClient['get']): FahsaiClient {
  return { get };
}
