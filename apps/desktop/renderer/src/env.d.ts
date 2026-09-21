import type { LearnLocalApi } from "@learnlocal/contracts";

declare global {
  interface Window {
    learnLocal: LearnLocalApi;
  }
}

export {};
